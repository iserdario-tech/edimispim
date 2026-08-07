import { describe, it, expect } from "vitest";
import { generateWeek, filterRecipes } from "../src/food/planner";
import { RARE_INGREDIENTS } from "../src/ui/FoodSetup";
import recipesJson from "../src/food/data/recipes.json";
import type { Constraints, MealCount, Recipe, Targets } from "../src/food/types";

const recipes = recipesJson as Recipe[];
const ALL = ["stove", "oven", "microwave", "blender", "multicooker", "airfryer"];
const targets: Targets = {
  bmr: 1500, tdee: 2200, kcalTarget: 1600, proteinGTarget: 120, fiberGTarget: 30, tempoKgPerWeek: 0.5,
};
const rhythm = { wakeMin: 420, bedMin: 1380 };

/**
 * Требование Сердара, слово в слово: «чтоб при каких-либо фильтрах мы не скатывались
 * до условно „ешь весь день овощи“ — это должно быть богатое и очень вкусное меню
 * на пиздец какой длительный период».
 *
 * Поэтому тут не один сценарий, а батарея ограничений. Проверяется не «работает ли код»,
 * а держится ли обещание: есть из чего выбирать, неделя не повторяется, в каждом приёме
 * есть еда, а не гарнир, и порция остаётся порцией.
 */
const CASES: [string, Constraints][] = [
  ["без ограничений", { cookware: ALL }],
  ["только плита", { cookware: ["stove"] }],
  ["плита и микроволновка", { cookware: ["stove", "microwave"] }],
  ["без молока", { cookware: ALL, allergens: ["milk"] }],
  ["без молока и глютена", { cookware: ALL, allergens: ["milk", "gluten"] }],
  ["без рыбы, яиц и орехов", { cookware: ALL, allergens: ["fish", "egg", "nuts"] }],
  ["небольшой бюджет", { cookware: ALL, budget: "small" }],
  ["только обычные продукты", { cookware: ALL, dislikes: RARE_INGREDIENTS }],
  ["обычные продукты и не любит курицу", { cookware: ALL, dislikes: [...RARE_INGREDIENTS, "курица"] }],
  ["славянская кухня", { cookware: ALL, cuisines: ["slavic"] }],
  ["строгий набор сразу", {
    cookware: ["stove", "oven"], allergens: ["fish"], budget: "small",
    dislikes: [...RARE_INGREDIENTS, "грибы"],
  }],
];

describe("меню не вырождается ни при каких фильтрах", () => {
  it.each(CASES)("%s: в каждом приёме есть из чего выбирать", (_label, constraints) => {
    const pool = filterRecipes(recipes, constraints);
    for (const type of ["breakfast", "lunch", "dinner", "dessert"] as const) {
      expect(pool.filter(r => r.meal_type === type).length, type).toBeGreaterThanOrEqual(8);
    }
  });

  it.each(CASES)("%s: неделя не приедается", (_label, constraints) => {
    const week = generateWeek(targets, recipes, { rhythm, constraints, mealCount: 4 });
    const uniq = new Set(week.flatMap(d => d.meals.map(m => m.recipe.id))).size;
    expect(uniq).toBeGreaterThanOrEqual(16);          // из 28 приёмов за неделю
  });

  it.each(CASES)("%s: это еда, а не гарнир", (_label, constraints) => {
    const week = generateWeek(targets, recipes, { rhythm, constraints, mealCount: 4 });
    for (const day of week) {
      // в дне есть хотя бы два по-настоящему белковых блюда — иначе это «весь день овощи»
      const solid = day.meals.filter(m => m.recipe.protein_g * m.servings >= 20).length;
      expect(solid, `белковых блюд: ${solid}`).toBeGreaterThanOrEqual(2);
      expect(day.totals.protein).toBeGreaterThanOrEqual(targets.proteinGTarget * 0.8);
    }
  });

  it.each(CASES)("%s: порция остаётся порцией", (_label, constraints) => {
    const week = generateWeek(targets, recipes, { rhythm, constraints, mealCount: 4 });
    for (const day of week) {
      for (const m of day.meals) {
        // «крем-суп ×3.4» — это полтора литра супа, а не обед
        expect(m.servings, `${m.recipe.name} ×${m.servings}`).toBeLessThanOrEqual(2);
      }
    }
  });

  it("на любом числе приёмов день собирается целиком", () => {
    for (const mealCount of [2, 3, 4, 5] as MealCount[]) {
      const week = generateWeek(targets, recipes, { rhythm, constraints: { cookware: ALL }, mealCount });
      for (const day of week) {
        expect(day.meals.length, `${mealCount} приёмов`).toBeGreaterThanOrEqual(Math.min(mealCount, 3));
        expect(Math.abs(day.totals.kcal - targets.kcalTarget)).toBeLessThanOrEqual(targets.kcalTarget * 0.15);
      }
    }
  });

  it("набор большой и растёт: не меньше 150 рецептов, у каждого шаги", () => {
    expect(recipes.length).toBeGreaterThanOrEqual(150);
    const noSteps = recipes.filter(r => !(r.steps ?? []).length);
    expect(noSteps.map(r => r.name)).toEqual([]);
  });
});
