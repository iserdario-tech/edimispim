import type { Profile, DayMode, DayToggles, PlanWindow } from "./types.js";
import { DEFAULTS } from "./defaults.js";

export function caffeineWindows(args: {
  profile: Profile; bedMin: number; mode: DayMode; toggles: DayToggles; badNight: boolean;
}): PlanWindow[] {
  const { profile, bedMin, mode, toggles, badNight } = args;
  if (toggles.noCaffeine) return [];
  const large = profile.caffeine.typicalMgPerDose >= DEFAULTS.caffeineLargeMg;
  const cutoffH = mode === "recovery"
    ? DEFAULTS.caffeineCutoffRecoveryH
    : large ? DEFAULTS.caffeineCutoffLargeH : DEFAULTS.caffeineCutoffModerateH;
  const extra = (badNight || mode === "recovery")
    ? " Спал плохо — с утра можно на чашку больше." : "";
  return [{
    kind: "caffeine_last", startMin: bedMin - cutoffH * 60, available: true,
    title: "Последний кофе",
    detail: `Позже этого времени кофе помешает уснуть ночью. До него — 1–2 чашки.${extra}`,
    why: "По исследованиям чашка кофе заметна для сна ещё примерно 9 часов, а большая доза — до 13. Чувствительность у всех разная: если засыпаешь легко, сдвинь время сам",
    refs: ["T6"],
  }];
}
