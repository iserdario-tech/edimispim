import type { Profile, DayContext, LastNight } from "./types.js";
import { parseHM } from "./time.js";
import { DEFAULTS } from "./defaults.js";
import { sleepDurationMin } from "./readiness.js";

export function computeBedMin(args: {
  profile: Profile; ctx: DayContext; lastNight: LastNight;
}): { wakeMin: number; bedMin: number; badNight: boolean } {
  const { profile, ctx, lastNight } = args;
  const wakeMin = parseHM(profile.anchorWakeHM);
  const dur = sleepDurationMin(lastNight, profile.targetSleepMin);
  const badNight = lastNight.quality <= 2 || dur < profile.targetSleepMin - 90 || !!ctx.toggles.hadAlcohol;

  // базовый отбой = подъём следующего дня минус цель сна
  let bedMin = wakeMin + 1440 - profile.targetSleepMin;
  if (ctx.mode === "recovery") bedMin -= 30;                 // чуть раньше якоря
  if (ctx.toggles.weekend) bedMin += DEFAULTS.weekendWakeShiftCapMin; // допускаем сдвиг ≤60
  if (ctx.mode === "crunch" && ctx.crunchUntilHM) {
    const workEnd = parseHM(ctx.crunchUntilHM);              // может быть >1440 ("27:00")
    bedMin = workEnd + 30;                                   // лечь через 30 мин после работы
  }
  return { wakeMin, bedMin, badNight };
}
