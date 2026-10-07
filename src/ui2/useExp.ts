import { useMemo } from "react";
import { targetsFor, type StoredState } from "../ui/storage.js";
import { targetsForToday } from "../food/index.js";
import { expenditure } from "../expenditure.js";

/** Реальный расход по весу и отметкам — для «Я → Вес и калории» и подсказки на «Сутках». */
export function useExp(state: StoredState, today: string) {
  return useMemo(() => {
    if (!state.food) return null;
    const base = targetsFor(state.food);
    const unadjusted = targetsFor({ ...state.food, kcalAdjust: 0 });
    const f = state.food;
    const targetOf = (iso: string) => targetsForToday(f.kcalAdjustAt && iso < f.kcalAdjustAt ? unadjusted : base, f.startISO, iso, f.pace).targets.kcalTarget;
    return {
      formula: base.tdee, tempo: base.tempoKgPerWeek,
      r: expenditure({
        today, weights: state.weights ?? [], eaten: state.eaten ?? {}, mealCount: f.mealCount, targetOf,
        currentTarget: targetOf(today),
        ...(f.startISO ? { startISO: f.startISO } : {}),
        ...(state.cheatDays ? { cheatDays: state.cheatDays } : {}),
        ...(f.kcalAdjustAt ? { lastAdjustISO: f.kcalAdjustAt } : {}),
      }),
    };
  }, [state.food, state.weights, state.eaten, state.cheatDays, today]);
}

/** «уходит на 0,4 кг» / «прибавляется на 0,2 кг» — темп словами, без минусов. */
export const paceRU = (lossPerWeek: number): string =>
  lossPerWeek >= 0 ? `уходит на ${lossPerWeek.toLocaleString("ru-RU")} кг` : `прибавляется на ${(-lossPerWeek).toLocaleString("ru-RU")} кг`;
