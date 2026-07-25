import type { Profile, LastNight, DayLog, Readiness } from "./types.js";
import { parseHM } from "./time.js";
import { regularityScore } from "./regularity.js";

export function sleepDurationMin(lastNight: LastNight, targetSleepMin: number): number {
  if (!lastNight.bedHM) return targetSleepMin;
  const bed = parseHM(lastNight.bedHM), woke = parseHM(lastNight.wokeHM);
  let dur = woke - bed;
  if (dur < 0) dur += 1440; // отбой вечером, подъём утром
  return dur;
}
export function computeReadiness(args: {
  profile: Profile; lastNight: LastNight; history: DayLog[]; hadAlcohol?: boolean;
}): { level: Readiness; whyRU: string; priorityRU: string } {
  const { profile, lastNight, history, hadAlcohol } = args;
  const dur = sleepDurationMin(lastNight, profile.targetSleepMin);
  const reg = regularityScore(history);
  const q = lastNight.quality;
  const shortfall = profile.targetSleepMin - dur; // >0 => недосып

  let level: Readiness;
  if (shortfall > 90 || q <= 2) level = "in_debt";
  else if (shortfall <= 30 && q >= 4 && reg >= 80) level = "charged";
  else level = "ok";
  if (hadAlcohol && level === "charged") level = "ok"; // алкоголь режет глубокий/REM — не «заряжен»

  const hours = (dur / 60).toFixed(1);
  const whyRU = `Сон ~${hours} ч, оценка ${q}/5, регулярность ${reg}/100${hadAlcohol ? " · вчера алкоголь" : ""}`;
  const priorityRU = level === "in_debt"
    ? "Ты недоспал. Главное сегодня: короткий сон днём и лечь пораньше."
    : level === "charged"
      ? "Ты бодр. Держи режим — свет с утра и ложись спать в одно время."
      : "Норма. Утренний свет и никакого позднего кофе закрепят бодрость.";
  return { level, whyRU, priorityRU };
}
