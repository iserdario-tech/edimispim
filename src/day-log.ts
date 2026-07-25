import type { DayMode } from "./types.js";

/**
 * Суточная запись — единственное место, где сон и еда встречаются как одни сутки.
 * Из этого ряда выводится всё остальное: регулярность, недельная петля, а позже —
 * личные сопоставления и опыты. Без него ничего из ядра продукта не существует.
 */
export interface DayRecord {
  date: string;                       // ISO "2026-07-25"
  sleep?: {
    wokeHM: string;
    bedHM?: string;                   // отбой прошлой ночью
    quality: 1 | 2 | 3 | 4 | 5;       // субъективная оценка, не измерение
    alcohol?: boolean;
  };
  food?: {
    plannedKcal?: number;
    followed?: boolean;               // «съел по плану»
    dinnerHM?: string;                // фактическое время ужина
    caffeineLastHM?: string;          // последний кофеин за день
  };
  body?: { weightKg?: number };
  ctx?: { mode?: DayMode };
}

/**
 * Сколько суток храним. У pospat было 30 — мало: недельная петля и будущие опыты
 * требуют месяцев, а не недель.
 */
export const MAX_DAYS = 180;

/** Слить запись в ряд по дате: существующий день дополняется, а не затирается целиком. */
export function upsertDay(days: DayRecord[], rec: DayRecord): DayRecord[] {
  const i = days.findIndex(d => d.date === rec.date);
  const merged: DayRecord =
    i < 0 ? rec : {
      ...days[i],
      ...rec,
      sleep: rec.sleep ?? days[i]!.sleep,
      food: { ...days[i]!.food, ...rec.food },
      body: { ...days[i]!.body, ...rec.body },
      ctx: { ...days[i]!.ctx, ...rec.ctx },
    };
  const out = i < 0 ? [...days, merged] : days.map((d, k) => (k === i ? merged : d));
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out.slice(-MAX_DAYS);
}

export const dayOf = (days: DayRecord[], date: string): DayRecord | undefined =>
  days.find(d => d.date === date);

/** Последняя запись со сном строго раньше указанной даты — «как спалось этой ночью». */
export function lastNightBefore(days: DayRecord[], date: string): DayRecord | undefined {
  return [...days].reverse().find(d => d.date <= date && d.sleep);
}
