import { describe, it, expect } from "vitest";
import recipes from "../src/food/data/recipes.json";
import { planWindow, filterRecipes, targetsForToday, expectedBedMin, applySwaps } from "../src/food/index";
import { targetsFor, type FoodSettings } from "../src/ui/storage";
import { dayOptsFor } from "../src/ui/dayOpts";
import { menuKey, remember, rememberedFor } from "../src/ui/menuMemory";
import type { Recipe } from "../src/food/types";

/** Показанное меню не меняется само: ни при обновлении правил подбора, ни при смене калорий. */
const food = {
  profile: { sex: "m", age: 33, heightCm: 180, weightKg: 92, goalWeightKg: 82, activity: "low" },
  constraints: { allergens: [], cookware: ["stove", "oven", "microwave"], budget: "medium", cuisines: [], dislikes: [] },
  mealCount: 4, pace: "normal", startISO: "2026-08-27", tuned: true,
} as unknown as FoodSettings;

describe("запомненное меню", () => {
  const D = "2026-10-08";
  const menu = remember(undefined, menuKey(food), { [D]: { dinner: "d7" } }, D);

  it("держится, пока не поменялись ограничения", () => {
    expect(rememberedFor(menu, food, D)).toEqual({ dinner: "d7" });
    expect(rememberedFor(menu, { ...food, kcalAdjust: -150 }, D)).toEqual({ dinner: "d7" });   // калории — только порции
    expect(rememberedFor(menu, { ...food, mealCount: 3 }, D)).toBeUndefined();
    expect(rememberedFor(menu, { ...food, constraints: { ...food.constraints, allergens: ["fish"] } }, D)).toBeUndefined();
  });

  it("в день «не готовлю» не действует", () => {
    expect(rememberedFor(menu, food, D, [D])).toBeUndefined();
  });

  it("старше двух недель забывается, другой ключ стирает всё", () => {
    expect(Object.keys(remember(menu, menuKey(food), {}, "2026-10-30").days)).toEqual([]);
    expect(remember(menu, "другой", { "2026-10-09": { lunch: "l1" } }, D).days).toEqual({ "2026-10-09": { lunch: "l1" } });
  });

  it("день из запомненных блюд — те же блюда и калории в ±3 %", () => {
    const safe = targetsFor(food);
    const pool = filterRecipes(recipes as never, { ...food.constraints, bannedIds: [] } as never) as Recipe[];
    const plan = () => planWindow(D, 7, pool,
      iso => targetsForToday(safe, food.startISO, iso, food.pace).targets,
      iso => dayOptsFor(food, iso, { wakeMin: 420, bedMin: expectedBedMin(420, 480) }, [], [], safe));
    // «старое» меню — другие блюда тех же приёмов, как если бы правила подбора поменялись
    const old = Object.fromEntries(plan().map(s => [s.iso, Object.fromEntries(s.day.meals.map(m => {
      const alt = pool.find(r => r.meal_type === m.recipe.meal_type && r.id !== m.recipe.id && Math.abs(r.kcal - m.recipe.kcal) < 150)!;
      return [m.slot, alt.id];
    }))]));
    for (const s of plan()) {
      applySwaps(s.day, old[s.iso], pool, s.targets, food.mealCount);
      expect(Object.fromEntries(s.day.meals.map(m => [m.slot, m.recipe.id]))).toEqual(old[s.iso]);
      expect(Math.abs(s.day.totals.kcal - s.targets.kcalTarget)).toBeLessThanOrEqual(s.targets.kcalTarget * 0.03);
    }
  });

  it("то же блюдо не трогается — порция остаётся подогнанной", () => {
    const safe = targetsFor(food);
    const pool = filterRecipes(recipes as never, { ...food.constraints, bannedIds: [] } as never) as Recipe[];
    const [s] = planWindow(D, 1, pool, iso => targetsForToday(safe, food.startISO, iso, food.pace).targets,
      iso => dayOptsFor(food, iso, { wakeMin: 420, bedMin: expectedBedMin(420, 480) }, [], [], safe));
    const before = s!.day.meals.map(m => m.servings);
    applySwaps(s!.day, Object.fromEntries(s!.day.meals.map(m => [m.slot, m.recipe.id])), pool, s!.targets, food.mealCount);
    expect(s!.day.meals.map(m => m.servings)).toEqual(before);
  });
});
