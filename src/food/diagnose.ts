import type { MealCount, MealType, Recipe } from "./types.js";

/**
 * Диагностика пула рецептов после фильтров.
 *
 * Зачем: ограничения складываются и незаметно выедают контент. На текущих 36 рецептах
 * аллергия на молоко оставляет 3 завтрака, молоко + яйца — ОДИН на всю неделю,
 * а все шесть аллергенов сразу — ни одного завтрака и ни одного десерта.
 * Без диагностики приложение молча собирало бы день из двух приёмов, и человек решил бы,
 * что так и задумано.
 */

const RU: Record<MealType, string> = {
  breakfast: "завтраков", lunch: "обедов", dinner: "ужинов", dessert: "десертов",
  snack: "перекусов",
};

/** Ниже этого числа вариантов слот повторяется за неделю почти каждый день. */
const MONOTONY_THRESHOLD = 3;

export interface PoolDiagnosis {
  ok: boolean;                 // день собирается полностью
  missing: MealType[];         // типов приёма нет вовсе
  monotonous: MealType[];      // вариантов мало, неделя будет однообразной
  counts: Record<string, number>;
  messageRU: string;           // пусто, если всё в порядке
}

/** Какие типы приёмов нужны для выбранной схемы. */
function neededTypes(mealCount: MealCount): MealType[] {
  const base: MealType[] = mealCount === 2 ? ["lunch", "dinner"] : ["breakfast", "lunch", "dinner"];
  return mealCount === 3 ? base : [...base, "dessert"];
}

export function diagnosePool(pool: Recipe[], mealCount: MealCount): PoolDiagnosis {
  const counts: Record<string, number> = {};
  for (const r of pool) counts[r.meal_type] = (counts[r.meal_type] ?? 0) + 1;

  const needed = neededTypes(mealCount);
  const missing = needed.filter(t => !counts[t]);
  const monotonous = needed.filter(t => (counts[t] ?? 0) > 0 && (counts[t] ?? 0) < MONOTONY_THRESHOLD);

  let messageRU = "";
  if (missing.length) {
    messageRU = `Под твои ограничения не осталось ${missing.map(t => RU[t]).join(" и ")}. ` +
      "День соберётся неполным. Проверь список аллергий, нелюбимое и технику на кухне — " +
      "скорее всего что-то одно отсекает слишком много.";
  } else if (monotonous.length) {
    const names = monotonous.map(t => RU[t]).join(" и ");
    messageRU = `Вариантов ${names} осталось мало, поэтому за неделю они будут повторяться. ` +
      "Если надоест — ослабь одно из ограничений.";
  }

  return { ok: missing.length === 0, missing, monotonous, counts, messageRU };
}
