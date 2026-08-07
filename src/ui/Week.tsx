import React, { useMemo, useState } from "react";
import type { Profile, DayLog } from "../index.js";
import { parseHM, fmtHM, weeklyInsight } from "../index.js";
import type { FoodSettings } from "./storage.js";
import { computeTargets, applySafety, generateWeek, buildGroceryList, expectedBedMin, filterRecipes, swapDish, type Day } from "../food/index.js";
import type { Recipe } from "../food/types.js";
import recipesJson from "../food/data/recipes.json";
import { anchor, anchorSummaryRU } from "../anchor.js";
import { toDayRecords } from "./dayRecords.js";
import { localDateISO } from "../today-date.js";
import { nextStep } from "../next-step.js";
import { plateau } from "../plateau.js";
import { GroceryBlock, MealIngredients } from "./Grocery.js";
import { SleepSparkline, WeightChart } from "./Charts.js";

const RECIPES = recipesJson as Recipe[];
const DOW = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/**
 * Неделя: меню, покупки и общая петля.
 *
 * Петля показывается как сопоставление, а не как вывод: «в дни X оценка сна была ниже».
 * Никаких коэффициентов и p-значений — статистики на двух неделях всё равно нет,
 * а вид точной цифры создаёт ложную уверенность.
 */
export function Week({ profile, history, food, weights, onAddWeight, onSetupFood }: {
  profile: Profile;
  history: DayLog[];
  food?: FoodSettings;
  weights?: { date: string; kg: number }[];
  onAddWeight: (kg: number) => void;
  onSetupFood: () => void;
}) {
  const [openDays, setOpenDays] = useState<Set<number>>(() => new Set([0]));
  const [openMeal, setOpenMeal] = useState<string | null>(null);
  const [rev, setRev] = useState(0);          // счётчик замен — заставляет перерисовать план
  const [kg, setKg] = useState("");
  const today = localDateISO();

  const plan = useMemo(() => {
    if (!food) return null;
    const safe = applySafety(computeTargets(food.profile), food.profile, {});
    const bedMin = expectedBedMin(parseHM(profile.anchorWakeHM), profile.targetSleepMin);
    const week = generateWeek(safe, RECIPES, {
      rhythm: { wakeMin: parseHM(profile.anchorWakeHM), bedMin },
      mealCount: food.mealCount,
      constraints: food.constraints,
    });
    return { week, grocery: buildGroceryList(week), safe, pool: filterRecipes(RECIPES, food.constraints) };
  }, [food, profile]);

  const toggleDay = (i: number) => setOpenDays(prev => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });
  const allOpen = !!plan && openDays.size === plan.week.length;
  const toggleAll = () => setOpenDays(allOpen ? new Set() : new Set(plan!.week.map((_, i) => i)));

  /** Заменить одно блюдо: следующий рецепт того же типа, порция под ту же долю калорий. */
  const swapOne = (day: Day, index: number) => {
    if (!plan || !food) return;
    if (swapDish(day, index, plan.safe, plan.pool, food.mealCount)) setRev(r => r + 1);
  };
  /** Заменить все блюда дня разом — когда день целиком не нравится. */
  const swapWholeDay = (day: Day) => {
    if (!plan || !food) return;
    let changed = false;
    for (let i = 0; i < day.meals.length; i++) {
      if (swapDish(day, i, plan.safe, plan.pool, food.mealCount)) changed = true;
    }
    if (changed) setRev(r => r + 1);
  };

  const insight = useMemo(
    () => weeklyInsight(history, today, profile.targetSleepMin),
    [history, today, profile.targetSleepMin],
  );

  const records = useMemo(() => toDayRecords(history, weights ?? []), [history, weights]);
  const anchorInfo = useMemo(() => anchor(records, profile.targetSleepMin), [records, profile.targetSleepMin]);
  const step = useMemo(() => nextStep(records, !!food), [records, food]);
  const plateauInfo = useMemo(() => plateau(records, profile.targetSleepMin), [records, profile.targetSleepMin]);

  // качество сна по дням за последнюю неделю — для спарклайна
  const qualitySeries = useMemo(() => {
    const base = Date.parse(today + "T00:00:00Z");
    return [...Array(7)].map((_, i) => {
      const d = new Date(base - (6 - i) * 86_400_000).toISOString().slice(0, 10);
      return history.find(h => h.date === d)?.quality ?? null;
    });
  }, [history, today]);

  const weightSeries = weights ?? [];
  const delta = weightSeries.length >= 2
    ? weightSeries[0]!.kg - weightSeries[weightSeries.length - 1]!.kg
    : null;

  return (
    <main className="wrap">
      <h1 className="page-title">Неделя</h1>

      <section className="card accent">
        <h3 className="card-h">Что дальше</h3>
        <p style={{ margin: "0 0 4px" }}>{step.titleRU}</p>
        <p className="small muted" style={{ margin: 0 }}>{step.whyRU}</p>
        {step.need > 1 && step.done < step.need && (
          <p className="small muted" style={{ marginTop: 6 }}>Уже есть: {step.done} из {step.need}.</p>
        )}
      </section>

      {plateauInfo.messageRU && (
        <section className="card">
          <h3 className="card-h">Почему вес стоит</h3>
          <p className="small">{plateauInfo.messageRU}</p>
          <p className="small muted">Это не расчёт, а взгляд на два ряда сразу — куда посмотреть в первую очередь.</p>
        </section>
      )}

      <section className="card">
        <h3 className="card-h">Как прошла неделя</h3>
        <div className="week-stats small">
          <span>Ночей отмечено: {insight.daysLogged}/7</span>
          {insight.daysLogged >= 2 && <span>Регулярность: {insight.regularity}/100</span>}
          {insight.avgSleepMin != null && <span>Средний сон: {(insight.avgSleepMin / 60).toFixed(1)} ч</span>}
          {insight.avgQuality != null && <span>Качество: {insight.avgQuality}/5</span>}
        </div>
        {insight.daysLogged >= 2 && (
          <div className="spark-row">
            <SleepSparkline series={qualitySeries} />
            <span className="small muted">качество сна, 7 дней</span>
          </div>
        )}
        {delta != null && (
          <p className="small" style={{ marginTop: 8 }}>
            Вес с первого замера: <b>{delta > 0 ? "−" : "+"}{Math.abs(delta).toFixed(1)} кг</b>
          </p>
        )}
        <WeightChart weights={weightSeries} goal={food?.profile.goalWeightKg} />
        {insight.avgSleepMin != null && delta != null && delta > 0 && insight.avgSleepMin < profile.targetSleepMin - 45 && (
          <p className="small note-warn">
            Вес снижается, но сон за неделю короче цели. Это стоит держать в голове: при таком
            сне в исследованиях меньшая часть потерянного веса приходится на жир.
          </p>
        )}
        {/* Поле веса: крупная цифра и подпись «кг» внутри поля — чтобы это читалось
            как замер, а не как случайное поле формы посреди карточки */}
        <div className="w-input">
          <div className="w-field">
            <input type="number" inputMode="decimal" step="0.1" placeholder="0,0" value={kg}
              onChange={e => setKg(e.target.value)} aria-label="Вес в килограммах" />
            <span className="w-unit">кг</span>
          </div>
          <button className="w-save" disabled={!+kg}
            onClick={() => { const v = +kg; if (v) { onAddWeight(v); setKg(""); } }}>
            Записать
          </button>
        </div>
        <p className="small muted">Взвешивайся раз в неделю в одно время: одна цифра прыгает, линия за недели показывает правду.</p>
      </section>

      <section className="card">
        <h3 className="card-h">Ровность режима</h3>
        <div className="anchor-row">
          <div className="anchor-num">{anchorInfo.score}<span className="small">/100</span></div>
          <div className="small muted">
            {anchorInfo.socialJetlagMin == null
              ? "насколько одинаково ты встаёшь изо дня в день"
              : <>встаёшь ли в одно время и насколько выходные уезжают от будней
                (<b>на {anchorInfo.socialJetlagMin} мин</b>)</>}
          </div>
        </div>
        <p className="small">{anchorInfo.verdictRU}</p>
        {anchorInfo.socialJetlagMin != null && (
          <p className="small muted">{anchorSummaryRU(anchorInfo)}</p>
        )}
        <p className="small muted">
          Зачем это: по наблюдениям на 231 тысяче человек ровный режим связан с меньшим весом
          и объёмом талии — сам по себе, отдельно от еды и количества сна.
        </p>
      </section>

      {!plan ? (
        <section className="card">
          <h3 className="card-h">Меню недели</h3>
          <p className="small">Чтобы собрать меню, нужно один раз заполнить короткую форму про еду.</p>
          <button className="chip on" onClick={onSetupFood}>Заполнить</button>
        </section>
      ) : (
        <>
          <section className="card wide" key={rev}>
            <div className="menu-head">
              <h3 className="card-h" style={{ margin: 0 }}>Меню на 7 дней</h3>
              <button className="linkbtn small" onClick={toggleAll}>
                {allOpen ? "свернуть все" : "развернуть все"}
              </button>
            </div>
            <p className="small muted">
              Цель: {plan.safe.kcalTarget} ккал и {plan.safe.proteinGTarget} г белка в день.
              Ужин каждый день привязан к твоему отбою. Кнопка ↻ меняет блюдо, сохраняя баланс дня.
            </p>
            {/* дни раскладываются по ширине окна: на телефоне столбиком,
                на компьютере — сколько колонок влезло */}
            <div className="week-days">
            {plan.week.map((day, i) => (
              <div key={i} className="day-block">
                <div className="day-head-row">
                  <button className="day-head" aria-expanded={openDays.has(i)}
                    onClick={() => toggleDay(i)}>
                    <b>{DOW[i]}</b>
                    <span className="small muted day-nums">
                      {day.totals.kcal} ккал · белок {day.totals.protein} г
                    </span>
                    <span className="chev">{openDays.has(i) ? "▾" : "▸"}</span>
                  </button>
                  <button className="swap-btn" title="Заменить все блюда дня"
                    aria-label={`Заменить все блюда дня ${i + 1}`}
                    onClick={() => swapWholeDay(day)}>↻ день</button>
                </div>
                {openDays.has(i) && (
                  <>
                  <div className="day-summary small muted">
                    За день: {day.totals.kcal} ккал · белок {day.totals.protein} г ·
                    клетчатка {day.totals.fiber} г из 30
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
                              <span className="chev">{openMeal === key ? " ▾" : " ▸"}</span>
                            </button>
                            <span className="small muted meal-meta">
                              {Math.round(m.recipe.kcal * m.servings)} ккал
                              {m.recipe.time_min ? ` · ${m.recipe.time_min} мин` : ""}
                            </span>
                          </span>
                          <button className="swap-btn" title="Заменить блюдо"
                            aria-label={`Заменить блюдо: ${m.recipe.name}`}
                            onClick={() => swapOne(day, k)}>↻</button>
                          {openMeal === key && <MealIngredients meal={m} />}
                        </li>
                      );
                    })}
                  </ul>
                  </>
                )}
              </div>
            ))}
            </div>
          </section>

          <GroceryBlock grocery={plan.grocery} />
        </>
      )}
    </main>
  );
}
