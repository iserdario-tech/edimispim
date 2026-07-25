import { describe, it, expect } from "vitest";
import { generateWeek, filterRecipes, generateDay } from "../src/food/planner";
import { parseHM } from "../src/time";
import recipesJson from "../src/food/data/recipes.json";
import type { Recipe, Targets } from "../src/food/types";

const recipes = recipesJson as Recipe[];
const targets: Targets = { bmr: 1400, tdee: 2250, kcalTarget: 1700, proteinGTarget: 120, fiberGTarget: 30, tempoKgPerWeek: 0.5 };
const rhythm = { wakeMin: parseHM("07:00"), bedMin: parseHM("23:00") };
const constraints = { cookware: ["stove", "oven", "microwave", "blender", "multicooker", "airfryer"] };

/**
 * Планировщик набирал рецепты по очереди и на клетчатку не смотрел: день выходил
 * около 20 г при цели 30, хотя контента хватает с запасом.
 */
describe("добор клетчатки", () => {
  it("неделя ощутимо ближе к цели по клетчатке, чем без добора", () => {
    const week = generateWeek(targets, recipes, { rhythm, constraints });
    const avg = week.reduce((s, d) => s + d.totals.fiber, 0) / week.length;
    expect(avg).toBeGreaterThanOrEqual(25);      // было ~20
  });

  it("КЛЮЧЕВОЕ: добор не ломает дефицит — калораж остаётся у цели", () => {
    const week = generateWeek(targets, recipes, { rhythm, constraints });
    for (const day of week) {
      expect(Math.abs(day.totals.kcal - targets.kcalTarget)).toBeLessThanOrEqual(targets.kcalTarget * 0.15);
    }
  });

  it("белок не проседает ради клетчатки — это два разных рычага сытости", () => {
    const week = generateWeek(targets, recipes, { rhythm, constraints });
    for (const day of week) {
      expect(day.totals.protein).toBeGreaterThan(targets.proteinGTarget * 0.7);
    }
  });

  it("число приёмов не меняется от замены", () => {
    const pool = filterRecipes(recipes, constraints);
    expect(generateDay(targets, pool, { rhythm, mealCount: 4 }).meals).toHaveLength(4);
    expect(generateDay(targets, pool, { rhythm, mealCount: 3 }).meals).toHaveLength(3);
  });

  it("если цель по клетчатке уже взята — план не трогается", () => {
    const rich: Recipe[] = [
      { id: "b", name: "b", meal_type: "breakfast", kcal: 400, protein_g: 30, fiber_g: 20, ingredients: [] },
      { id: "l", name: "l", meal_type: "lunch", kcal: 600, protein_g: 45, fiber_g: 20, ingredients: [] },
      { id: "d", name: "d", meal_type: "dinner", kcal: 500, protein_g: 40, fiber_g: 20, ingredients: [] },
    ];
    const day = generateDay(targets, rich, { rhythm, mealCount: 3 });
    expect(day.meals.map(m => m.recipe.id).sort()).toEqual(["b", "d", "l"]);
  });

  it("пул из одного блюда на слот — замены нет, но и падения нет", () => {
    const tiny: Recipe[] = [
      { id: "b", name: "b", meal_type: "breakfast", kcal: 400, protein_g: 30, fiber_g: 1, ingredients: [] },
      { id: "l", name: "l", meal_type: "lunch", kcal: 600, protein_g: 45, fiber_g: 1, ingredients: [] },
      { id: "d", name: "d", meal_type: "dinner", kcal: 500, protein_g: 40, fiber_g: 1, ingredients: [] },
    ];
    const day = generateDay(targets, tiny, { rhythm, mealCount: 3 });
    expect(day.meals).toHaveLength(3);
    expect(day.totals.fiber).toBeLessThan(targets.fiberGTarget);   // честно недобрали
  });
});
