import type { FoodProfile, SafeTargets, Screen, Sex, Targets } from "./types";

const FLOOR: Record<Sex, number> = { m: 1500, f: 1200 };
const RED_CONDITIONS = ["thyroid", "pcos", "psych_meds"];

export function applySafety(
  targets: Targets,
  profile: Pick<FoodProfile, "sex">,
  screen: Screen = {},
): SafeTargets {
  const flags: string[] = [];
  const scoff = screen.scoffScore ?? 0;
  const conditions = screen.conditions ?? [];
  const referDoctor =
    scoff >= 2 || conditions.some(c => RED_CONDITIONS.includes(c)) || !!screen.nesFlagged;

  if (scoff >= 2) flags.push("screen_eating_disorder");
  for (const c of conditions) if (RED_CONDITIONS.includes(c)) flags.push("condition_" + c);
  // синдром ночного питания (X21): при ожирении 6–16%, виден только на стыке сна и еды.
  // Реакция та же, что на другие красные флаги: не жёсткий дефицит + к специалисту.
  if (screen.nesFlagged) flags.push("screen_night_eating");

  let kcalTarget = targets.kcalTarget;
  const floor = FLOOR[profile.sex] ?? 1200;
  if (kcalTarget < floor) {
    kcalTarget = floor;
    flags.push("kcal_floored");
  }

  if (referDoctor) {
    const soft = targets.tdee - 300;
    if (kcalTarget < soft) {
      kcalTarget = soft;
      flags.push("deficit_softened");
    }
  }

  return {
    ...targets,
    kcalTarget,
    tempoKgPerWeek: Math.min(targets.tempoKgPerWeek, 1),
    flags,
    referDoctor,
  };
}
