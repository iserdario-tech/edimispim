import { slotShares } from "./food/planner.js";
import { OWN_FACTOR, type DayEaten } from "./food/eaten.js";
import type { MealCount } from "./food/types.js";

/**
 * Реальный расход по весу и отмеченной еде — «адаптивный расход».
 *
 * Формула (Mifflin × коэффициент активности) ошибается у конкретного человека на сотни
 * калорий, и узнать это можно только по нему самому: сколько он ел и как менялся вес.
 * Расход = среднее съеденное за полностью записанные дни + 7700 × скорость снижения
 * веса по линии тренда (наклон регрессии, а не разность двух взвешиваний).
 *
 * Все пороги — из bridge-science/research-2026-09-23-training-expenditure.md, раздел
 * «Что делать приложению»: первые 14 дней — вода и гликоген, в расчёт не идут; окно
 * 28 дней; взвешиваний от 4 в неделю; в каждой неделе от 5 записанных дней; оценке
 * верим при 95% ДИ не шире ±250 ккал; цель меняем не чаще раза в 2 недели, шагом
 * ½ разницы и не больше 150 ккал.
 *
 * Незаписанные дни и читмилы не считаются нулём — их просто нет в расчёте. Если читмилов
 * много, оценка расхода выходит ниже настоящей; экран об этом предупреждает.
 */
const KCAL_PER_KG = 7700;
const FIRST_ESTIMATE_DAY = 28;
const SKIP_FIRST_DAYS = 14;
const WINDOW_DAYS = 28;
const WEIGH_INS_PER_WEEK = 4;
const LOGGED_PER_WEEK = 5;
const MAX_CI = 250;
const CHANGE_EVERY_DAYS = 14;
const MAX_STEP = 150;
const MIN_STEP = 50;
/** Плановый дефицит — тот же, что в `computeTargets`. */
const DEFICIT = 550;

const MS_DAY = 86_400_000;
const dayN = (iso: string) => Math.round(Date.parse(iso + "T00:00:00Z") / MS_DAY);

export type Expenditure =
  | { status: "wait"; daysLeft: number }
  | { status: "data"; weighIns: number; weighInsNeed: number; weeksLogged: number; weeks: number }
  | { status: "uncertain"; tdee: number; ci: number }
  | { status: "ready"; tdee: number; ci: number; lossPerWeek: number; step: number; nextChangeInDays: number };

export function expenditure(a: {
  today: string;
  startISO?: string;
  weights: { date: string; kg: number }[];
  eaten: Record<string, DayEaten>;
  cheatDays?: string[];
  mealCount: MealCount;
  /** Калорийность плана на дату (во время входа в режим у каждого дня своя). */
  targetOf: (iso: string) => number;
  /** Цель сегодня — от неё считается поправка. */
  currentTarget: number;
  lastAdjustISO?: string;
}): Expenditure {
  const today = dayN(a.today);
  const start = a.startISO ? dayN(a.startISO) : today;
  if (today - start < FIRST_ESTIMATE_DAY) return { status: "wait", daysLeft: FIRST_ESTIMATE_DAY - (today - start) };

  const from = Math.max(start + SKIP_FIRST_DAYS, today - WINDOW_DAYS + 1);
  const weeks = Math.floor((today - from + 1) / 7);
  const inWindow = (iso: string) => { const n = dayN(iso); return n >= from && n <= today; };

  const weights = a.weights.filter(w => inWindow(w.date));
  const cheat = new Set(a.cheatDays ?? []);
  const shares = slotShares(a.mealCount);
  // полностью записанный день: отмечены все приёмы плана; читмил — не данные о еде
  const logged = Object.entries(a.eaten).filter(([iso, e]) =>
    inWindow(iso) && !cheat.has(iso) && e.planned > 0 && Object.keys(e.marks).length >= e.planned);
  let weeksLogged = 0;
  for (let w = 0; w < weeks; w++) {
    const hi = today - 7 * w, lo = hi - 6;
    if (logged.filter(([iso]) => dayN(iso) >= lo && dayN(iso) <= hi).length >= LOGGED_PER_WEEK) weeksLogged++;
  }
  const weighInsNeed = WEIGH_INS_PER_WEEK * weeks;
  if (weights.length < weighInsNeed || weeksLogged < weeks) {
    return { status: "data", weighIns: weights.length, weighInsNeed, weeksLogged, weeks };
  }

  // съеденное за день — плановая доля каждого приёма, своё — с поправкой на размер
  const intakes = logged.map(([iso, e]) => {
    let part = 0;
    for (const [slot, mark] of Object.entries(e.marks) as [keyof typeof shares, string][]) {
      const k = mark === "own" ? OWN_FACTOR[e.sizes?.[slot] ?? "usual"] : 1;
      part += (shares[slot] ?? 0) * k;
    }
    return (e.dayKcal ?? a.targetOf(iso)) * part + (e.extras ?? []).reduce((s, x) => s + x.kcal, 0);
  });
  const n = intakes.length;
  const meanIntake = intakes.reduce((s, x) => s + x, 0) / n;
  const sdIntake = Math.sqrt(intakes.reduce((s, x) => s + (x - meanIntake) ** 2, 0) / Math.max(1, n - 1));

  // линия тренда веса: наклон кг/день и его погрешность
  const xs = weights.map(w => dayN(w.date)), ys = weights.map(w => w.kg);
  const mx = xs.reduce((s, x) => s + x, 0) / xs.length, my = ys.reduce((s, y) => s + y, 0) / ys.length;
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i]! - my), 0) / sxx;
  const rss = xs.reduce((s, x, i) => s + (ys[i]! - (my + slope * (x - mx))) ** 2, 0);
  const seSlope = Math.sqrt(rss / Math.max(1, xs.length - 2) / sxx);

  const tdee = Math.round(meanIntake - KCAL_PER_KG * slope);
  const ci = Math.round(1.96 * Math.sqrt((KCAL_PER_KG * seSlope) ** 2 + (sdIntake / Math.sqrt(n)) ** 2));
  if (ci > MAX_CI) return { status: "uncertain", tdee, ci };

  const half = (tdee - DEFICIT - a.currentTarget) / 2;
  const clamped = Math.max(-MAX_STEP, Math.min(MAX_STEP, half));
  const step = Math.abs(clamped) < MIN_STEP ? 0 : Math.round(clamped / 10) * 10;
  const since = a.lastAdjustISO ? today - dayN(a.lastAdjustISO) : Infinity;
  return {
    status: "ready", tdee, ci,
    lossPerWeek: +(-slope * 7).toFixed(2),
    step,
    nextChangeInDays: Math.max(0, CHANGE_EVERY_DAYS - since),
  };
}
