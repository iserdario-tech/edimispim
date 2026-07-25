import type { DayLog } from "./types.js";
import { parseHM } from "./time.js";

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length; if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
export function regularityScore(history: DayLog[]): number {
  const recent = history.slice(-7).map(h => parseHM(h.wokeHM));
  if (recent.length <= 1) return 100;
  const med = median(recent);
  const mad = median(recent.map(x => Math.abs(x - med))); // медианное абс. отклонение (мин)
  // 0 мин -> 100; 60 мин MAD -> 0; линейно
  const score = Math.round(100 - (mad / 60) * 100);
  return Math.max(0, Math.min(100, score));
}
