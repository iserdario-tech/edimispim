import type { DayLog } from "./types.js";
import { regularityScore } from "./regularity.js";
import { sleepDurationMin } from "./readiness.js";

const DAY_MS = 86_400_000;
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const isoMinusDays = (iso: string, n: number): string =>
  new Date(Date.parse(iso) - n * DAY_MS).toISOString().slice(0, 10);
const daysAgo = (todayISO: string, iso: string): number =>
  Math.round((Date.parse(todayISO) - Date.parse(iso)) / DAY_MS);

export interface WeeklyInsight {
  daysLogged: number;         // отмечено дней за последние 7
  regularity: number;         // 0..100 (по подъёмам)
  avgQuality: number | null;  // среднее качество сна, 1..5
  avgSleepMin: number | null; // среднее по дням, где записан отбой
  alcoholNights: number;      // ночей с алкоголем за последние 7
  summaryRU: string;          // человеческий вывод
}

export function weeklyInsight(history: DayLog[], todayISO: string, targetSleepMin: number): WeeklyInsight {
  const last7 = history.filter(h => { const d = daysAgo(todayISO, h.date); return d >= 0 && d < 7; });
  const daysLogged = last7.length;
  const withBed = last7.filter(h => h.bedHM);
  const alcoholNights = last7.filter(h => h.hadAlcohol).length;
  const reg = regularityScore(history);
  const summaryRU = daysLogged < 2
    ? "Отмечайся каждое утро — через пару дней покажу тренд по сну."
    : alcoholNights >= 3
      ? "Алкоголь 3+ ночи за неделю заметно режет глубокий и REM-сон. Меньше выпивки ближе ко сну — больше бодрости."
      : reg >= 80
        ? "Режим стабильный — это лучший рычаг бодрости. Так держать."
        : "Подъёмы «гуляют». Стабильное время подъёма даст больше бодрости, чем кофе.";
  return {
    daysLogged,
    regularity: reg,
    avgQuality: daysLogged ? Math.round(mean(last7.map(h => h.quality)) * 10) / 10 : null,
    avgSleepMin: withBed.length
      ? Math.round(mean(withBed.map(h => sleepDurationMin(h, targetSleepMin))))
      : null,
    alcoholNights,
    summaryRU,
  };
}

// Серия подряд-дней с отметкой, заканчивая сегодня (или вчера, если сегодня ещё не отмечено).
export function streakDays(history: DayLog[], todayISO: string): number {
  const marked = new Set(history.map(h => h.date));
  let i = marked.has(todayISO) ? 0 : 1;
  let n = 0;
  while (marked.has(isoMinusDays(todayISO, i))) { n++; i++; }
  return n;
}
