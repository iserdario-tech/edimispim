import type { DayLog } from "../index.js";
import { upsertDay, type DayRecord } from "../day-log.js";

/**
 * История сна + замеры веса → единый ряд суток для объяснителя.
 *
 * Пока UI хранит их раздельно (история досталась от pospat), но объяснителю нужен именно
 * общий ряд — иначе он не увидит связь «вес падает, а сон плохой».
 */
export function toDayRecords(history: DayLog[], weights: { date: string; kg: number }[] = []): DayRecord[] {
  let days: DayRecord[] = [];
  for (const h of history) {
    days = upsertDay(days, {
      date: h.date,
      sleep: { wokeHM: h.wokeHM, bedHM: h.bedHM, quality: h.quality, alcohol: h.hadAlcohol },
    });
  }
  for (const w of weights) days = upsertDay(days, { date: w.date, body: { weightKg: w.kg } });
  return days;
}
