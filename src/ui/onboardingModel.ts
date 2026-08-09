import type { Profile, Chronotype } from "../index.js";
import { parseHM, fmtHM } from "../index.js";

export interface OnboardingForm {
  wakeHM: string; bedHM: string; chronotype: Chronotype;
  caffeineMg: number; caffeineRegular: boolean; napPossible: boolean;
}
/**
 * Время из поля ввода годно к расчёту?
 *
 * `input type="time"` можно очистить — браузер отдаёт пустую строку, а `parseHM`
 * на ней БРОСАЕТ исключение. То есть человек, стерший время подъёма, получал по кнопке
 * «Построить план» белый экран вместо плана. Проверка нужна и здесь, и в самой сборке
 * профиля: сохранённое состояние тоже может оказаться битым.
 */
export function isValidTime(hm: string): boolean {
  try { return Number.isFinite(parseHM(hm)); } catch { return false; }
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
  // подъём — якорь всего плана дня; без годного времени берём общепринятое утро,
  // потому что уронить приложение на пустом поле хуже, чем поставить семь часов
  const wakeHM = isValidTime(f.wakeHM) ? f.wakeHM : "07:00";
  const bedHM = isValidTime(f.bedHM) ? f.bedHM : "23:00";
  let dur = parseHM(wakeHM) - parseHM(bedHM);
  if (dur < 0) dur += 1440;
  const target = Math.max(420, Math.min(540, dur));
  return {
    anchorWakeHM: wakeHM,
    targetSleepMin: Number.isFinite(target) ? target : 465,
    chronotype: f.chronotype,
    caffeine: { typicalMgPerDose: f.caffeineMg, regularUser: f.caffeineRegular },
    napPossibleByDefault: f.napPossible,
    goal: "alertness",
  };
}
