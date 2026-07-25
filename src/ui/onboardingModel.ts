import type { Profile, Chronotype } from "../index.js";
import { parseHM, fmtHM } from "../index.js";

export interface OnboardingForm {
  wakeHM: string; bedHM: string; chronotype: Chronotype;
  caffeineMg: number; caffeineRegular: boolean; napPossible: boolean;
}
export function formFromProfile(p: Profile): OnboardingForm {
  let bed = parseHM(p.anchorWakeHM) - p.targetSleepMin;
  if (bed < 0) bed += 1440;
  return {
    wakeHM: p.anchorWakeHM, bedHM: fmtHM(bed), chronotype: p.chronotype,
    caffeineMg: p.caffeine.typicalMgPerDose, caffeineRegular: p.caffeine.regularUser,
    napPossible: p.napPossibleByDefault,
  };
}
export function buildProfile(f: OnboardingForm): Profile {
  let dur = parseHM(f.wakeHM) - parseHM(f.bedHM);
  if (dur < 0) dur += 1440;
  const target = Math.max(420, Math.min(540, dur));
  return {
    anchorWakeHM: f.wakeHM,
    targetSleepMin: Number.isFinite(target) ? target : 465,
    chronotype: f.chronotype,
    caffeine: { typicalMgPerDose: f.caffeineMg, regularUser: f.caffeineRegular },
    napPossibleByDefault: f.napPossible,
    goal: "alertness",
  };
}
