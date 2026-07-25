import type { Activity, FoodProfile, Targets } from "./types";

const ACTIVITY: Record<Activity, number> = { low: 1.2, medium: 1.375, high: 1.55 };
const DEFICIT = 550;

// ponytail: одна формула (Mifflin-St Jeor); Katch-McArdle и прочие — когда понадобятся.
export function computeTargets(p: FoodProfile): Targets {
  const sexConst = p.sex === "m" ? 5 : -161;
  const bmr = Math.round(10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + sexConst);
  const tdee = Math.round(bmr * (ACTIVITY[p.activity] ?? 1.2));
  const kcalTarget = tdee - DEFICIT;
  const refWeight = p.goalWeightKg || p.weightKg;
  const proteinGTarget = Math.round(1.6 * refWeight);
  const tempoKgPerWeek = Math.min(1, +((DEFICIT * 7) / 7700).toFixed(2));
  return { bmr, tdee, kcalTarget, proteinGTarget, fiberGTarget: 30, tempoKgPerWeek };
}
