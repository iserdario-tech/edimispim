import type { DayPlan, Readiness, WindowKind } from "../index.js";
import { fmtHM } from "../index.js";
import type { TimelineRow } from "./mealRows.js";

/**
 * Строка ленты суток — та же, что у приёмов пищи: они и сливаются в одну ось времени.
 * Раньше здесь лежал точный двойник `TimelineRow`, и типы расходились при каждой правке.
 */
export type PlanRow = TimelineRow;
export interface PlanView {
  readiness: { level: Readiness; label: string; color: string; whyRU: string; priorityRU: string };
  rows: PlanRow[]; notes: string[];
  nextIdx: number | null;     // индекс ближайшего шага «сейчас/дальше» (null — на сегодня всё)
}
const ICONS: Record<WindowKind, string> = {
  morning_light: "☀️", caffeine_last: "☕", caffeine_boost: "⚡", nap: "😴",
  coffee_nap: "☕😴", afternoon_dip: "🚶", warm_shower: "🚿", winddown: "🌙", target_bed: "🛌",
};
/**
 * Цвета берутся из палитры приложения, а не задаются числом.
 *
 * Здесь стояли три шестнадцатеричных цвета из чужой темы: они не знали ни про светлое
 * оформление, ни про тёмное, и точка состояния светилась одинаково ярко на любом фоне —
 * единственное место в приложении, которое не переключалось вместе со всем остальным.
 */
const READINESS: Record<Readiness, { label: string; color: string }> = {
  charged: { label: "Бодрый", color: "var(--ok)" },
  ok: { label: "Норма", color: "var(--warn)" },
  in_debt: { label: "Недосып", color: "var(--danger)" },
};
// "03:00 (+1)" -> "03:00 ночью" — понятнее, чем технический (+1)
const nice = (min: number): string => fmtHM(min).replace(" (+1)", " ночью");

export function toPlanView(plan: DayPlan, nowMin?: number): PlanView {
  const rows: PlanRow[] = plan.windows.map((w) => ({
    time: nice(w.startMin),
    endTime: w.endMin != null ? nice(w.endMin) : undefined,
    icon: ICONS[w.kind],
    title: w.title, detail: w.detail, why: w.why,
    past: nowMin != null ? (w.endMin ?? w.startMin) <= nowMin : undefined,
    startMin: w.startMin,
    kind: "sleep" as const,
  }));
  // ближайший не-прошедший шаг. ponytail: наивное сравнение в пределах суток —
  // окна аврала после полуночи (startMin>1440) не корректируем, это редкий кейс.
  const nextIdx = nowMin == null ? null
    : (() => { const i = plan.windows.findIndex((w) => (w.endMin ?? w.startMin) > nowMin); return i === -1 ? null : i; })();
  const r = READINESS[plan.readiness.level];
  return {
    readiness: { level: plan.readiness.level, label: r.label, color: r.color,
      whyRU: plan.readiness.whyRU, priorityRU: plan.readiness.priorityRU },
    rows, notes: plan.notesRU, nextIdx,
  };
}
