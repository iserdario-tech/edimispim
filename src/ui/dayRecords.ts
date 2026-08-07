import type { DayLog } from "../index.js";
import { upsertDay, type DayRecord } from "../day-log.js";
import { followedPlan, type DayEaten } from "../food/eaten.js";

/**
 * История сна + замеры веса + отметки еды → единый ряд суток для объяснителя.
 *
 * Пока UI хранит их раздельно (история досталась от pospat), но объяснителю нужен именно
 * общий ряд — иначе он не увидит связь «вес падает, а сон плохой».
 *
 * Отметки еды здесь не просто переносятся: из них считается `food.followed`, на который
 * опирается разбор плато. Пока их никто не писал, ветка «дело в еде» не могла сработать
 * ни разу — приложение умело винить только сон.
 */
export function toDayRecords(
  history: DayLog[],
  weights: { date: string; kg: number }[] = [],
  eaten: Record<string, DayEaten> = {},
  cheatDays: string[] = [],
): DayRecord[] {
  const cheat = new Set(cheatDays);
  let days: DayRecord[] = [];
  for (const h of history) {
    days = upsertDay(days, {
      date: h.date,
      sleep: { wokeHM: h.wokeHM, bedHM: h.bedHM, quality: h.quality, alcohol: h.hadAlcohol },
    });
  }
  for (const w of weights) days = upsertDay(days, { date: w.date, body: { weightKg: w.kg } });
  for (const [date, e] of Object.entries(eaten)) {
    // объявленный читмил не данные о приверженности: он запланирован, а не сорван
    if (cheat.has(date)) continue;
    const followed = followedPlan(e);
    if (followed !== undefined) days = upsertDay(days, { date, food: { followed } });
  }
  return days;
}
