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

/**
 * Белок при регулярных силовых: 1.6 г/кг в сутки, одинаково каждый день.
 *
 * Метаанализ Morton 2018: выше 1.6 г/кг прирост мышечной массы на силовых не растёт
 * (ДИ до 2.2). Считается от «референсного» веса — меньшего из текущего и веса при ИМТ 30:
 * при ожирении белок на полный вес завышает норму за счёт жира (обзор Weijs).
 * В день тренировки ничего не добавляем — важна дневная сумма, а не день.
 * Источники и оговорки — bridge-science/research-2026-09-23-training-expenditure.md, T4.
 */
export function strengthProtein(p: Pick<FoodProfile, "weightKg" | "heightCm">): number {
  const bmi30 = 30 * (p.heightCm / 100) ** 2;
  return Math.round(1.6 * Math.min(p.weightKg, bmi30));
}
