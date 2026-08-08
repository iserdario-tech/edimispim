import React, { useMemo, useState } from "react";
import type { Profile } from "../index.js";
import { parseHM, fmtHM } from "../index.js";
import type { FoodSettings } from "./storage.js";
import {
  computeTargets, applySafety, generateDay, buildGroceryList, expectedBedMin,
  filterRecipes, swapDish, targetsForToday, prefersFamiliar,
} from "../food/index.js";
import type { Recipe } from "../food/types.js";
import recipesJson from "../food/data/recipes.json";
import { localDateISO, plusDaysISO } from "../today-date.js";
import { GroceryBlock, MealIngredients } from "./Grocery.js";
import { Fridge } from "./Fridge.js";
import { readLS, writeLS, PANTRY_KEY } from "./localStore.js";
import type { Pantry } from "../food/packaging.js";
import { IconChevron, IconSwap } from "./Icons.js";

const RECIPES = recipesJson as Recipe[];
/**
 * Меню считается на СЕМЬ БЛИЖАЙШИХ ДНЕЙ, начиная с сегодняшнего, а не на календарную
 * неделю с понедельника. Причина простая: список покупок на прошедший вторник бесполезен,
 * а во время входа в дефицит календарная неделя ещё и прятала весь смысл — старт выпадал
 * на середину недели, и все семь дней показывали один и тот же начальный калораж
 * вместо лестницы вниз.
 */
const DOW = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const dayLabel = (iso: string, offset: number): string => {
  if (offset === 0) return "сегодня";
  if (offset === 1) return "завтра";
  return DOW[new Date(iso + "T12:00:00Z").getUTCDay()] ?? "";
};

/**
 * Еда: меню недели, холодильник, покупки.
 *
 * Раньше всё это лежало на экране «Неделя» вместе с итогами, весом, плато и ровностью
 * режима — восемь карточек подряд, где до списка покупок надо было проскроллить пять
 * блоков аналитики. Разделение простое и честное: здесь то, что ДЕЛАЕШЬ (готовишь,
 * покупаешь, меняешь блюда), а на «Итогах» — то, что СМОТРИШЬ.
 *
 * Apple про это говорит прямо: ограничивать число одновременно видимых контролов,
 * второстепенное убирать вглубь, частые действия держать под рукой.
 */
export function Food({ profile, food, ratings, onRate, onSetupFood }: {
  profile: Profile;
  food?: FoodSettings;
  ratings?: Record<string, 1 | -1>;
  onRate?: (id: string, value: 1 | -1) => void;
  onSetupFood: () => void;
}) {
  const [openDays, setOpenDays] = useState<Set<number>>(() => new Set([0]));
  const [openMeal, setOpenMeal] = useState<string | null>(null);
  const [rev, setRev] = useState(0);          // счётчик замен — заставляет перерисовать план
  // кладовка нужна двум местам сразу: списку покупок и замене блюда, поэтому живёт здесь
  const [pantry, setPantry] = useState<Pantry>(() => readLS<Pantry>(PANTRY_KEY, {}));
  const savePantry = (next: Pantry) => { setPantry(next); writeLS(PANTRY_KEY, next); };
  const today = localDateISO();

  /**
   * Меню недели. Каждый день считается по СВОЕЙ цели: во время вхождения в дефицит
   * калораж спускается изо дня в день, и неделя должна это показывать — иначе человек
   * видит одну цифру и не понимает, почему в приложении «Сегодня» стоит другая.
   */
  const plan = useMemo(() => {
    if (!food) return null;
    const safe = applySafety(computeTargets(food.profile), food.profile, {});
    const bedMin = expectedBedMin(parseHM(profile.anchorWakeHM), profile.targetSleepMin);
    // оценки блюд идут в план: «палец вниз» убирает рецепт совсем, «вверх» — ставит чаще
    const rated = Object.entries(ratings ?? {});
    const pool = filterRecipes(RECIPES, {
      ...food.constraints,
      bannedIds: rated.filter(([, v]) => v === -1).map(([id]) => id),
    });
    const liked = rated.filter(([, v]) => v === 1).map(([id]) => id);
    const days = Array.from({ length: 7 }, (_, d) => {
      const date = plusDaysISO(today, d);
      const { targets, ramp } = targetsForToday(safe, food.startISO, date, food.pace);
      const day = generateDay(targets, pool, {
        rhythm: { wakeMin: parseHM(profile.anchorWakeHM), bedMin },
        mealCount: food.mealCount, offset: d, familiar: prefersFamiliar(ramp), liked,
      });
      return { date, day, targets, ramp };
    });
    const week = days.map(d => d.day);
    const todayRamp = targetsForToday(safe, food.startISO, today, food.pace);
    return { days, week, grocery: buildGroceryList(week), safe, pool, ramp: todayRamp.ramp };
  }, [food, profile, today, ratings]);

  const toggleDay = (i: number) => setOpenDays(prev => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });
  const allOpen = !!plan && openDays.size === plan.week.length;
  const toggleAll = () => setOpenDays(allOpen ? new Set() : new Set(plan!.week.map((_, i) => i)));

  /**
   * Заменить одно блюдо: другой рецепт того же типа, порция под ту же долю калорий.
   * Цель берётся у ЭТОГО дня, а не общая: во время вхождения у каждого дня она своя,
   * и замена по общей цели тихо ломала бы калораж дня.
   */
  const swapOne = (dayIdx: number, index: number) => {
    if (!plan || !food) return;
    const d = plan.days[dayIdx];
    if (d && swapDish(d.day, index, d.targets, plan.pool, food.mealCount, pantry)) setRev(r => r + 1);
  };
  /** Заменить все блюда дня разом — когда день целиком не нравится. */
  const swapWholeDay = (dayIdx: number) => {
    if (!plan || !food) return;
    const d = plan.days[dayIdx];
    if (!d) return;
    let changed = false;
    for (let i = 0; i < d.day.meals.length; i++) {
      if (swapDish(d.day, i, d.targets, plan.pool, food.mealCount, pantry)) changed = true;
    }
    if (changed) setRev(r => r + 1);
  };

  if (!plan) {
    return (
      <main className="wrap">
        <h1 className="page-title">Еда</h1>
        <section className="card">
          <h3 className="card-h">Меню пока не собрано</h3>
          <p className="small">Чтобы собрать меню, нужно один раз заполнить короткую форму про еду.</p>
          <button className="chip on" onClick={onSetupFood}>Заполнить</button>
        </section>
      </main>
    );
  }

  return (
    <main className="wrap">
      <h1 className="page-title">
        Еда
        <span className="page-sub">меню, холодильник и покупки</span>
      </h1>

      <section className="card wide" key={rev}>
        <div className="menu-head">
          <h3 className="card-h" style={{ margin: 0 }}>Меню на 7 дней</h3>
          <button className="linkbtn small" onClick={toggleAll}>
            {allOpen ? "свернуть все" : "развернуть все"}
          </button>
        </div>
        <p className="small muted">
          {plan.ramp.active
            ? <>Идёт вход в режим: цель по калориям снижается изо дня в день, к {plan.ramp.total}-му
               дню — {plan.ramp.kcalGoal} ккал. Белок ({plan.safe.proteinGTarget} г) не снижается вовсе.</>
            : <>Цель: {plan.safe.kcalTarget} ккал и {plan.safe.proteinGTarget} г белка в день.</>}
          {" "}Ужин каждый день привязан к твоему отбою. Кнопка ↻ меняет блюдо, сохраняя баланс дня.
        </p>
        {/* дни раскладываются по ширине окна: на телефоне столбиком,
            на компьютере — сколько колонок влезло */}
        <div className="week-days">
        {plan.days.map(({ date, day, ramp }, i) => (
          <div key={i} className="day-block">
            <div className="day-head-row">
              <button className="day-head" aria-expanded={openDays.has(i)}
                onClick={() => toggleDay(i)}>
                <b>{dayLabel(date, i)}</b>
                <span className="small muted day-nums">
                  {day.totals.kcal} ккал · белок {day.totals.protein} г
                </span>
                <span className="chev"><IconChevron open={openDays.has(i)} /></span>
              </button>
              <button className="swap-btn" title="Заменить все блюда дня"
                aria-label={`Заменить все блюда дня ${i + 1}`}
                onClick={() => swapWholeDay(i)}><IconSwap /> день</button>
            </div>
            {openDays.has(i) && (
              <div className="reveal">
              {/* Калории и белок уже стоят в шапке дня — повторять их здесь значило
                  показывать одно и то же дважды и переносить строку на вторую строчку.
                  Остаётся то, чего в шапке нет. */}
              <div className="day-summary small muted">
                Клетчатка {day.totals.fiber} г из 30
                {ramp.active && <> · вход в режим, день {ramp.day} из {ramp.total}</>}
              </div>
              <ul className="day-meals">
                {day.meals.map((m, k) => {
                  const key = `${i}-${k}`;
                  return (
                    <li key={k} className="meal-row">
                      <span className="meal-time">{fmtHM(m.timeMin)}</span>
                      <span className="meal-main">
                        <button className="meal-name" aria-expanded={openMeal === key}
                          onClick={() => setOpenMeal(openMeal === key ? null : key)}>
                          {m.recipe.name}
                          <span className="chev"><IconChevron open={openMeal === key} /></span>
                        </button>
                        <span className="small muted meal-meta">
                          {Math.round(m.recipe.kcal * m.servings)} ккал
                          {m.recipe.time_min ? ` · ${m.recipe.time_min} мин` : ""}
                        </span>
                      </span>
                      <button className="swap-btn" title="Заменить блюдо"
                        aria-label={`Заменить блюдо: ${m.recipe.name}`}
                        onClick={() => swapOne(i, k)}><IconSwap /></button>
                      {openMeal === key && (
                        <MealIngredients meal={m} rating={ratings?.[m.recipe.id]} onRate={onRate} />
                      )}
                    </li>
                  );
                })}
              </ul>
              </div>
            )}
          </div>
        ))}
        </div>
      </section>

      <Fridge pantry={pantry} onPantry={savePantry} pool={plan.pool} />
      <GroceryBlock grocery={plan.grocery} pantry={pantry} onPantry={savePantry} />
    </main>
  );
}
