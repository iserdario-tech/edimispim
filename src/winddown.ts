import type { DayToggles, PlanWindow } from "./types.js";
import { DEFAULTS } from "./defaults.js";

export function winddownWindows(args: { bedMin: number; toggles: DayToggles }): PlanWindow[] {
  const { bedMin, toggles } = args;
  const shower: PlanWindow = {
    kind: "warm_shower", startMin: bedMin - DEFAULTS.warmShowerBeforeBedMin, available: true,
    title: "Тёплый душ или ванна", detail: "Тёплый душ 10–15 минут, вода приятно горячая.",
    why: "Тёплый душ примерно за полтора часа до сна помогает быстрее заснуть", refs: ["T32"],
  };
  const wind: PlanWindow = {
    kind: "winddown", startMin: bedMin - DEFAULTS.winddownBeforeBedMin, available: true,
    title: "Подготовка ко сну", detail: toggles.eveningBusy
      ? "Короткий ритуал: приглуши свет, спокойно подыши, телефон убери подальше от кровати."
      : "Приглуши свет, отложи экраны, спокойно подыши или почитай. Телефон убери подальше от кровати."
    ,
    why: "Тусклый свет и спокойные дела помогают мозгу настроиться на сон", refs: ["T7", "T31", "T37"],
  };
  const bed: PlanWindow = {
    kind: "target_bed", startMin: bedMin, available: true,
    title: "Пора спать", detail: "Ложись в это время — и лучше каждый день одинаково.",
    why: "Одинаковое время сна — самое важное для бодрости на следующий день", refs: ["T46"],
  };
  return [shower, wind, bed];
}
