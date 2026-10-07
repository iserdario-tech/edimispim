import { useCallback, useEffect, useMemo, useState } from "react";
import { parseHM } from "../index.js";
import {
  buildGroceryList, scaleGrocery, expectedBedMin, planWindow, filterRecipes, applySwaps, targetsForToday,
} from "../food/index.js";
import type { Recipe } from "../food/types.js";
import recipesJson from "../food/data/recipes.json";
import { targetsFor, type StoredState } from "../ui/storage.js";
import { dayOptsFor } from "../ui/dayOpts.js";
import { menuKey, rememberedFor, type MenuMemory } from "../ui/menuMemory.js";
import { readLS, writeLS, PANTRY_KEY } from "../ui/localStore.js";
import type { Pantry } from "../food/packaging.js";
import { localDateISO } from "../today-date.js";
import { readPair, sharePantry } from "../ui/pairSync.js";

const RECIPES = recipesJson as Recipe[];
let shareTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Меню на 7 дней и покупки — для «Еды» и «В магазине» 2.0.
 *
 * Расчёт тот же, что был у старой вкладки: календарный план, ручные замены поверх,
 * настройки дня (время на готовку, «не готовлю», остатки) из общей `dayOptsFor`,
 * продукты на всех за столом. Кладовка — общая с заменой блюд «из того, что дома».
 */
export function useWeek(state: StoredState, onRemember?: (key: string, days: MenuMemory["days"]) => void) {
  const today = localDateISO();
  const [pantry, setPantry] = useState<Pantry>(() => readLS<Pantry>(PANTRY_KEY, {}));
  // без отправки партнёру — для кладовки, пришедшей от партнёра
  const setPantryQuiet = useCallback((next: Pantry) => { setPantry(next); writeLS(PANTRY_KEY, next); }, []);
  // галочка «взял» — сразу партнёру, но не каждым тапом: пачка за 2 секунды уходит одной записью
  const savePantry = (next: Pantry) => {
    setPantryQuiet(next);
    if (!readPair()) return;
    clearTimeout(shareTimer); shareTimer = setTimeout(() => void sharePantry(next), 2000);
  };
  const [rev, setRev] = useState(0);
  const food = state.food;

  const plan = useMemo(() => {
    if (!food) return null;
    const safe = targetsFor(food);
    const bedMin = expectedBedMin(parseHM(state.profile.anchorWakeHM), state.profile.targetSleepMin);
    const rated = Object.entries(state.ratings ?? {});
    const pool = filterRecipes(RECIPES, { ...food.constraints, bannedIds: rated.filter(([, v]) => v === -1).map(([id]) => id) });
    const liked = rated.filter(([, v]) => v === 1).map(([id]) => id);
    const fresh: MenuMemory["days"] = {};
    const days = planWindow(today, 7, pool,
      iso => targetsForToday(safe, food.startISO, iso, food.pace).targets,
      iso => dayOptsFor(food, iso, { wakeMin: parseHM(state.profile.anchorWakeHM), bedMin }, liked, state.noCookDays, safe),
    ).map(s => {
      // запомненное меню держит блюда; новый день запоминается таким, каким его собрал планировщик
      const kept = rememberedFor(state.menu, food, s.iso, state.noCookDays);
      if (!kept && !state.noCookDays?.includes(s.iso)) fresh[s.iso] = Object.fromEntries(s.day.meals.map(m => [m.slot, m.recipe.id]));
      applySwaps(s.day, { ...kept, ...state.swaps?.[s.iso] }, pool, s.targets, food.mealCount);
      return { date: s.iso, day: s.day, targets: s.targets };
    });
    const grocery = scaleGrocery(buildGroceryList(days.map(d => d.day)), food.household ?? 1);
    return { days, grocery, pool, safe, fresh };
    // rev — после ручной замены день надо пересобрать с новым блюдом
  }, [food, state.profile, state.ratings, state.swaps, state.menu, state.noCookDays, today, rev]);
  useEffect(() => {
    if (food && plan && Object.keys(plan.fresh).length) onRemember?.(menuKey(food), plan.fresh);
  }, [plan]);

  return { today, plan, pantry, savePantry, setPantryQuiet, bump: () => setRev(r => r + 1) };
}
export type WeekModel = ReturnType<typeof useWeek>;
