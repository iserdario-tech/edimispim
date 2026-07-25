import type { DayToggles, PlanWindow } from "./types.js";
import { DEFAULTS } from "./defaults.js";

export function lightWindows(args: {
  wakeMin: number; bedMin: number; toggles: DayToggles; recovery: boolean;
}): PlanWindow[] {
  const { wakeMin, bedMin, toggles, recovery } = args;
  const morning: PlanWindow = toggles.noBrightLight
    ? {
        kind: "morning_light", startMin: wakeMin, endMin: wakeMin + DEFAULTS.morningLightWindowMin,
        available: true, title: "Вместо яркого света",
        detail: "Яркого света нет — выйди на улицу в перерыв или включи лампу поярче.",
        why: "Свет по утрам бодрит и настраивает внутренние часы; без него эффект слабее", refs: ["T7"],
      }
    : {
        kind: "morning_light", startMin: wakeMin, endMin: wakeMin + DEFAULTS.morningLightWindowMin,
        available: true, title: recovery ? "Побольше света с утра" : "Утренний свет",
        detail: DEFAULTS.morningLightDoText,
        why: "Утренний яркий свет бодрит и настраивает внутренние часы; в день восстановления помогает вернуть сбитый режим",
        refs: recovery ? ["T7", "T35"] : ["T7"],
      };
  const dip: PlanWindow = {
    kind: "afternoon_dip", startMin: wakeMin + 9 * 60, available: true,
    title: "Дневная вялость", detail: "Выйди на свет, подвигайся или прогуляйся — это бодрит лучше позднего кофе.",
    why: "После обеда часто клонит в сон; свет и движение бодрят и не мешают ночному сну", refs: ["T7", "T13"],
  };
  return [morning, dip];
}
