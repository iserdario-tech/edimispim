import type { DayLog } from "./types.js";
import { parseHM } from "./time.js";

/**
 * Ровность подъёма: медианное отклонение времени подъёма за последнюю неделю.
 *
 * Возвращает `null`, пока ночей меньше четырёх, — и это главное здесь.
 * Раньше функция отдавала 100 при пустой истории, и «идеальная регулярность»
 * утекала сразу в три места: в статус дня («регулярность 100/100» человеку,
 * который ничего не отмечал), в итоги недели и в ровность режима.
 * Приложение хвалило за режим, о котором не знало ничего.
 *
 * Четыре ночи — тот же порог, который приложение называет вслух в «Что дальше»:
 * «с четырёх ночей уже видно, ровно ли держится режим». Один порог на всё
 * приложение, а не три разных в трёх файлах.
 */

/** Меньше этого числа ночей — говорить не о чем. */
export const MIN_NIGHTS_FOR_REGULARITY = 4;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length; if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function regularityScore(history: DayLog[]): number | null {
  const recent = history.slice(-7).map(h => parseHM(h.wokeHM));
  if (recent.length < MIN_NIGHTS_FOR_REGULARITY) return null;
  const med = median(recent);
  const mad = median(recent.map(x => Math.abs(x - med))); // медианное абс. отклонение (мин)
  // 0 мин -> 100; 60 мин MAD -> 0; линейно
  const score = Math.round(100 - (mad / 60) * 100);
  return Math.max(0, Math.min(100, score));
}
