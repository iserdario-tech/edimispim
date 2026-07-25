import React, { useMemo, useState } from "react";
import type { Profile, DayLog } from "../index.js";
import { parseHM, fmtHM, weeklyInsight } from "../index.js";
import type { FoodSettings } from "./storage.js";
import { computeTargets, applySafety, generateWeek, buildGroceryList, expectedBedMin } from "../food/index.js";
import type { Recipe } from "../food/types.js";
import recipesJson from "../food/data/recipes.json";
import { anchor, anchorSummaryRU } from "../anchor.js";
import { toDayRecords } from "./dayRecords.js";
import { localDateISO } from "../today-date.js";
import { nextStep } from "../next-step.js";
import { plateau } from "../plateau.js";

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
  const [openDay, setOpenDay] = useState<number | null>(0);
  const [showGrocery, setShowGrocery] = useState(false);
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
    return { week, grocery: buildGroceryList(week), safe };
  }, [food, profile]);

  const insight = useMemo(
    () => weeklyInsight(history, today, profile.targetSleepMin),
    [history, today, profile.targetSleepMin],
  );

  const records = useMemo(() => toDayRecords(history, weights ?? []), [history, weights]);
  const anchorInfo = useMemo(() => anchor(records, profile.targetSleepMin), [records, profile.targetSleepMin]);
  const step = useMemo(() => nextStep(records, !!food), [records, food]);
  const plateauInfo = useMemo(() => plateau(records, profile.targetSleepMin), [records, profile.targetSleepMin]);

  const weightSeries = weights ?? [];
  const delta = weightSeries.length >= 2
    ? weightSeries[0]!.kg - weightSeries[weightSeries.length - 1]!.kg
    : null;

  return (
    <main className="wrap">
      <h2>Неделя целиком</h2>

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
        {delta != null && (
          <p className="small" style={{ marginTop: 8 }}>
            Вес с первого замера: <b>{delta > 0 ? "−" : "+"}{Math.abs(delta).toFixed(1)} кг</b>
          </p>
        )}
        {insight.avgSleepMin != null && delta != null && delta > 0 && insight.avgSleepMin < profile.targetSleepMin - 45 && (
          <p className="small note-warn">
            Вес снижается, но сон за неделю короче цели. Это стоит держать в голове: при таком
            сне в исследованиях меньшая часть потерянного веса приходится на жир.
          </p>
        )}
        <div className="w-input" style={{ marginTop: 10 }}>
          <input type="number" step="0.1" placeholder="вес, кг" value={kg}
            onChange={e => setKg(e.target.value)} aria-label="Вес в килограммах" />
          <button className="chip" onClick={() => { const v = +kg; if (v) { onAddWeight(v); setKg(""); } }}>
            Записать
          </button>
        </div>
        <p className="small muted">Взвешивайся раз в неделю в одно время: одна цифра прыгает, линия за недели показывает правду.</p>
      </section>

      <section className="card">
        <h3 className="card-h">Якорь режима</h3>
        <div className="anchor-row">
          <div className="anchor-num">{anchorInfo.score}<span className="small">/100</span></div>
          <div className="small muted">
            {anchorInfo.socialJetlagMin == null
              ? "ровность подъёма"
              : <>ровность подъёма и разъезд будни/выходные (<b>{anchorInfo.socialJetlagMin} мин</b>)</>}
          </div>
        </div>
        <p className="small">{anchorInfo.verdictRU}</p>
        {anchorInfo.socialJetlagMin != null && (
          <p className="small muted">{anchorSummaryRU(anchorInfo)}</p>
        )}
      </section>

      {!plan ? (
        <section className="card">
          <h3 className="card-h">Меню недели</h3>
          <p className="small">Чтобы собрать меню, нужно один раз заполнить короткую форму про еду.</p>
          <button className="chip on" onClick={onSetupFood}>Заполнить</button>
        </section>
      ) : (
        <>
          <section className="card">
            <h3 className="card-h">Меню на 7 дней</h3>
            <p className="small muted">
              Цель: {plan.safe.kcalTarget} ккал и {plan.safe.proteinGTarget} г белка в день.
              Ужин каждый день привязан к твоему отбою.
            </p>
            {plan.week.map((day, i) => (
              <div key={i} className="day-block">
                <button className="day-head" aria-expanded={openDay === i}
                  onClick={() => setOpenDay(openDay === i ? null : i)}>
                  <b>{DOW[i]}</b>
                  <span className="small muted">{day.totals.kcal} ккал · белок {day.totals.protein} г</span>
                  <span className="chev">{openDay === i ? "▾" : "▸"}</span>
                </button>
                {openDay === i && (
                  <ul className="day-meals">
                    {day.meals.map((m, k) => (
                      <li key={k}>
                        <span className="meal-time">{fmtHM(m.timeMin)}</span>
                        <span>{m.recipe.name}</span>
                        <span className="small muted">
                          {Math.round(m.recipe.kcal * m.servings)} ккал
                          {m.recipe.time_min ? ` · ${m.recipe.time_min} мин` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </section>

          <section className="card">
            <button className="card-h card-h-btn" aria-expanded={showGrocery}
              onClick={() => setShowGrocery(!showGrocery)}>
              Покупки на неделю · ≈{plan.grocery.estCostRub} ₽ <span className="chev">{showGrocery ? "▾" : "▸"}</span>
            </button>
            {showGrocery && (
              <>
                <p className="small muted">
                  Скоропорт отмечен — его лучше брать ближе к дню или замораживать.
                  Цены прикидочные, под конкретный магазин не калибровались.
                </p>
                <ul className="grocery">
                  {plan.grocery.items.map((it, i) => (
                    <li key={i}>
                      <span>{it.name}</span>
                      <span className="small muted">
                        {it.qty} {it.unit}{it.perishable ? " · скоропорт" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}
    </main>
  );
}
