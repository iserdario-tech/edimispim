import { describe, it, expect } from "vitest";
import { coverageOf, planPurchase, type Pantry } from "../src/food/packaging";
import { generateDay, filterRecipes, swapDish } from "../src/food/planner";
import recipesJson from "../src/food/data/recipes.json";
import type { Recipe, SafeTargets } from "../src/food/types";

const RECIPES = recipesJson as Recipe[];
const CONSTRAINTS = { cookware: ["stove", "oven", "microwave", "blender", "multicooker", "airfryer"] };
const targets: SafeTargets = {
  bmr: 1700, tdee: 2300, kcalTarget: 1750, proteinGTarget: 128, fiberGTarget: 30,
  tempoKgPerWeek: 0.5, flags: [], referDoctor: false,
};

describe("холодильник", () => {
  it("готовность считается по весу, а не по числу позиций", () => {
    const ings = [
      { name: "куриное филе", unit: "г", qty: 200 },
      { name: "соль", unit: "г", qty: 5 },          // мелочь на кухне есть всегда — не считаем
      { name: "рис", unit: "г", qty: 100 },
    ];
    // дома только рис: по позициям это «одно из двух», по весу — треть
    const cov = coverageOf(ings, { "рис|г": 100 });
    expect(cov.share).toBeCloseTo(100 / 300, 2);
    expect(cov.missing).toEqual(["куриное филе"]);
    expect(coverageOf(ings, { "рис|г": 100, "куриное филе|г": 500 }).missing).toEqual([]);
  });

  it("порция учитывается: полторы порции требуют полутора наборов продуктов", () => {
    const ings = [{ name: "рис", unit: "г", qty: 100 }];
    expect(coverageOf(ings, { "рис|г": 100 }, 1).share).toBe(1);
    expect(coverageOf(ings, { "рис|г": 100 }, 2).share).toBe(0.5);
  });

  it("покупки не просят то, что уже лежит дома", () => {
    const items = [{ name: "рис", unit: "г", qty: 300 }];
    const [empty] = planPurchase(items, {});
    const [stocked] = planPurchase(items, { "рис|г": 300 });
    expect(empty!.toBuy).toBe(300);
    expect(stocked!.toBuy).toBe(0);
  });

  /**
   * Отдельная просьба: «замена блюда должна учитывать холодильник». Ходить в магазин
   * ради одной замены — ровно та мелочь, из-за которой вместо готовки заказывают доставку.
   */
  it("замена блюда предлагает то, что готовится из домашних запасов", () => {
    const pool = filterRecipes(RECIPES, CONSTRAINTS);
    const day = generateDay(targets, pool, { rhythm: { wakeMin: 420, bedMin: 1380 }, mealCount: 4 });
    const i = day.meals.findIndex(m => m.slot === "dinner");
    const before = day.meals[i]!.recipe.id;

    // набиваем кладовку составом одного конкретного ужина — его и должна предложить замена
    const target = pool.find(r => r.meal_type === "dinner" && r.id !== before && (r.ingredients ?? []).length > 2)!;
    const pantry: Pantry = {};
    for (const ing of target.ingredients ?? []) {
      pantry[`${ing.name.toLowerCase().trim()}|${ing.unit}`] = ing.qty * 5;
    }

    expect(swapDish(day, i, targets, pool, 4, pantry)).toBe(true);
    const after = day.meals.find(m => m.slot === "dinner")!.recipe;
    expect(after.id).not.toBe(before);
    expect(coverageOf(after.ingredients ?? [], pantry).share).toBeGreaterThan(0);
  });

  it("без кладовки замена работает как раньше — по кругу", () => {
    const pool = filterRecipes(RECIPES, CONSTRAINTS);
    const day = generateDay(targets, pool, { rhythm: { wakeMin: 420, bedMin: 1380 }, mealCount: 4 });
    const i = day.meals.findIndex(m => m.slot === "lunch");
    const seen = new Set<string>([day.meals[i]!.recipe.id]);
    for (let k = 0; k < 3; k++) {
      const idx = day.meals.findIndex(m => m.slot === "lunch");
      swapDish(day, idx, targets, pool, 4);
      seen.add(day.meals.find(m => m.slot === "lunch")!.recipe.id);
    }
    expect(seen.size).toBe(4);          // каждое нажатие даёт новое блюдо, а не одно и то же
  });
});
