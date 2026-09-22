import type { DayRecord } from "./day-log.js";
import { sleepDurationMin } from "./readiness.js";
import { isRoughNight } from "./food/adapt.js";

/**
 * Сон и еда у конкретного человека: держится ли план после плохой ночи так же,
 * как после обычной.
 *
 * Это ради чего приложение вообще отмечает и ночи, и еду: общая наука говорит, что
 * недосып роняет самоконтроль (X24), а эта карточка показывает, как это выглядит
 * у тебя. Подаётся как наблюдение, без процентов и выводов о причинах: на паре
 * десятков дней статистики нет, а в плохие дни могло совпасть что угодно ещё.
 *
 * «Плохая ночь» — та же, что перестраивает день: оценка 1–2 или сна на час меньше цели.
 */
const MIN_PER_GROUP = 3;

export type SleepFoodLink =
  | { ready: false; good: number; rough: number }
  | { ready: true; good: { followed: number; total: number }; rough: { followed: number; total: number } };

export function sleepFoodLink(days: DayRecord[], targetSleepMin: number): SleepFoodLink {
  const good = { followed: 0, total: 0 }, rough = { followed: 0, total: 0 };
  for (const d of days) {
    if (!d.sleep || d.food?.followed === undefined) continue;
    const sleptMin = d.sleep.bedHM ? sleepDurationMin(d.sleep, targetSleepMin) : undefined;
    const g = isRoughNight({ quality: d.sleep.quality, targetSleepMin, ...(sleptMin !== undefined ? { sleptMin } : {}) }) ? rough : good;
    g.total++;
    if (d.food.followed) g.followed++;
  }
  return good.total >= MIN_PER_GROUP && rough.total >= MIN_PER_GROUP
    ? { ready: true, good, rough }
    : { ready: false, good: good.total, rough: rough.total };
}

/** Итог месяца. Меньше недели данных — итога нет: «2 ночи, 1 день по плану» не итог, а шум. */
export interface MonthRecap {
  nights: number;
  avgSleepMin?: number;
  followed: number;
  marked: number;
  weightFrom?: number;
  weightTo?: number;
}

export function monthRecap(days: DayRecord[], ym: string): MonthRecap | null {
  const mine = days.filter(d => d.date.startsWith(ym)).sort((a, b) => a.date.localeCompare(b.date));
  const nights = mine.filter(d => d.sleep).length;
  const marked = mine.filter(d => d.food?.followed !== undefined).length;
  if (Math.max(nights, marked) < 7) return null;
  // средний сон — только там, где отбой известен: подставлять цель значило бы выдумать сон
  const durations = mine.flatMap(d => d.sleep?.bedHM ? [sleepDurationMin(d.sleep, 480)] : []);
  const weights = mine.flatMap(d => typeof d.body?.weightKg === "number" ? [d.body.weightKg] : []);
  return {
    nights,
    ...(durations.length ? { avgSleepMin: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) } : {}),
    followed: mine.filter(d => d.food?.followed === true).length,
    marked,
    ...(weights.length ? { weightFrom: weights[0]!, weightTo: weights[weights.length - 1]! } : {}),
  };
}
