import { describe, it, expect } from "vitest";
import { filterRecipes, generateDay } from "../src/food/planner";
import { RARE_INGREDIENTS } from "../src/ui/FoodSetup";
import recipesJson from "../src/food/data/recipes.json";
import type { Recipe } from "../src/food/types";

const recipes = recipesJson as Recipe[];
const ALL_COOKWARE = ["stove", "oven", "microwave", "blender", "multicooker", "airfryer"];
const targets = { bmr: 1600, tdee: 2200, kcalTarget: 1700, proteinGTarget: 120, fiberGTarget: 30, tempoKgPerWeek: 0.5 };

/**
 * «Я временно в России в командировке, гочжан тут не найти» — галочка «только обычные
 * продукты» кладёт редкие названия в dislikes. Тест следит за двумя вещами сразу:
 * блюда с ними действительно уходят, а меню на этом не рассыпается.
 */
describe("только обычные продукты", () => {
  const ordinary = filterRecipes(recipes, { cookware: ALL_COOKWARE, dislikes: RARE_INGREDIENTS });

  it("блюда с редкими продуктами уходят из меню", () => {
    const left = ordinary.filter(r =>
      RARE_INGREDIENTS.some(rare =>
        [r.name, ...(r.ingredients ?? []).map(i => i.name)].join(" ").toLowerCase().includes(rare)),
    );
    expect(left.map(r => r.name)).toEqual([]);
  });

  it("фильтр ловит продукт по составу, даже если в названии его нет", () => {
    // сироп топинамбура спрятан в составе сырников — по названию его не найти
    const withSyrup = recipes.filter(r => (r.ingredients ?? []).some(i => i.name === "сироп топинамбура"));
    expect(withSyrup.length).toBeGreaterThan(0);
    expect(ordinary.map(r => r.id)).not.toContain(withSyrup[0].id);
  });

  it("без редких продуктов день всё равно собирается", () => {
    const day = generateDay(targets, ordinary, { mealCount: 4, rhythm: { wakeMin: 420, bedMin: 1380 } });
    expect(day.meals.length).toBe(4);
    expect(day.totals.kcal).toBeGreaterThan(targets.kcalTarget * 0.85);
    expect(day.totals.kcal).toBeLessThan(targets.kcalTarget * 1.15);
  });

  it("на каждый приём остаётся из чего выбирать", () => {
    for (const type of ["breakfast", "lunch", "dinner", "dessert"] as const) {
      expect(ordinary.filter(r => r.meal_type === type).length, type).toBeGreaterThanOrEqual(5);
    }
  });
});
