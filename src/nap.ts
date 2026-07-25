import type { Profile, DayMode, DayToggles, PlanWindow } from "./types.js";
import { DEFAULTS } from "./defaults.js";

export function napWindow(args: {
  profile: Profile; wakeMin: number; bedMin: number; mode: DayMode; toggles: DayToggles; badNight: boolean;
}): PlanWindow | null {
  const { profile, wakeMin, bedMin, mode, toggles, badNight } = args;
  if (!profile.napPossibleByDefault && !toggles.napUnavailable && mode !== "recovery") return null;

  let start = wakeMin + 7 * 60; // середина окна 6–8ч после подъёма
  const latest = bedMin - DEFAULTS.napNotLaterBeforeBedH * 60;
  if (start > latest) start = latest;
  const end = start + DEFAULTS.napSlotMin;

  if (toggles.napUnavailable) {
    return {
      kind: "nap", startMin: start, available: true,
      title: "Вместо дневного сна",
      detail: "Вздремнуть нельзя — посиди 3–5 минут с закрытыми глазами или спокойно подыши, и пройдись в перерыв.",
      why: "Даже короткий отдых и движение помогают, когда поспать не получается",
      refs: ["T5"],
    };
  }
  const coffee = mode === "recovery" || badNight;
  return {
    kind: coffee ? "coffee_nap" : "nap", startMin: start, endMin: end, available: true,
    title: coffee ? "Кофе и короткий сон" : "Короткий сон днём",
    detail: coffee
      ? "Быстро выпей чашку кофе и сразу ложись на 15–20 минут. Кофе подействует как раз к пробуждению — встанешь бодрым."
      : "Поспи 10–20 минут, поставь будильник на 20. Дольше не спи.",
    why: coffee
      ? "Кофе и короткий сон вместе бодрят сильнее всего: кофе начинает действовать к пробуждению"
      : "Короткий сон 10–20 минут восстанавливает силы, и после него не будешь разбитым",
    refs: coffee ? ["T5", "T14"] : ["T5"],
  };
}
