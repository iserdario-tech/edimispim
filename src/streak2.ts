import type { Day } from "./food/types.js";
import type { DayEaten } from "./food/eaten.js";

/**
 * Серия 2.0: засчитывается за ОТМЕТКУ, а не за идеальный день.
 *
 * Старая серия рвалась от любого пропуска, и человек, забывший отметиться в субботу,
 * терял «🔥 40 подряд» — после этого бросают вовсе. Здесь, как в Gentler Streak и Finch:
 * свободный день (читмил) засчитан, а пропуск гасится «заморозкой» — до двух за
 * календарную неделю. Сегодня без отметки серию не рвёт: день ещё не закончился.
 */
const MS_DAY = 86_400_000;
const shift = (iso: string, days: number) =>
  new Date(Date.parse(iso + "T00:00:00Z") + days * MS_DAY).toISOString().slice(0, 10);
/** Понедельник недели, в которую попадает дата. */
const weekOf = (iso: string) => {
  const dow = (new Date(iso + "T00:00:00Z").getUTCDay() + 6) % 7;
  return shift(iso, -dow);
};

export function streakWithFreezes(
  markedDates: string[], protectedDates: string[], today: string, freezesPerWeek = 2,
): number {
  const ok = new Set([...markedDates, ...protectedDates]);
  if (!ok.size) return 0;
  const earliest = [...ok].sort()[0]!;
  const used = new Map<string, number>();
  let count = 0;
  let day = ok.has(today) ? today : shift(today, -1);
  while (day >= earliest) {
    if (ok.has(day)) count++;
    else {
      const w = weekOf(day);
      const n = used.get(w) ?? 0;
      if (n >= freezesPerWeek) break;
      used.set(w, n + 1);
    }
    day = shift(day, -1);
  }
  return count;
}

/** Цифра на иконке приложения: сколько приёмов сегодня ещё не отмечено. */
export const unmarkedToday = (day: Day | null, eaten: DayEaten | undefined): number =>
  day ? day.meals.filter(m => !eaten?.marks[m.slot]).length : 0;
