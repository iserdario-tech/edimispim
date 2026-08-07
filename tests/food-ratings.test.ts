import { describe, it, expect } from "vitest";
import { filterRecipes, generateWeek } from "../src/food/planner";
import recipesJson from "../src/food/data/recipes.json";
import type { Recipe, SafeTargets } from "../src/food/types";

const RECIPES = recipesJson as Recipe[];
const CONSTRAINTS = { cookware: ["stove", "oven", "microwave", "blender", "multicooker", "airfryer"] };
const targets: SafeTargets = {
  bmr: 1700, tdee: 2300, kcalTarget: 1750, proteinGTarget: 128, fiberGTarget: 30,
  tempoKgPerWeek: 0.5, flags: [], referDoctor: false,
};
const week = (opts: { liked?: string[]; banned?: string[] } = {}) =>
  generateWeek(targets, RECIPES, {
    rhythm: { wakeMin: 420, bedMin: 1380 }, mealCount: 4,
    constraints: { ...CONSTRAINTS, ...(opts.banned ? { bannedIds: opts.banned } : {}) },
    ...(opts.liked ? { liked: opts.liked } : {}),
  });

describe("оценки блюд", () => {
  it("«палец вниз» убирает блюдо из меню полностью", () => {
    const pool = filterRecipes(RECIPES, CONSTRAINTS);
    const lunches = pool.filter(r => r.meal_type === "lunch").slice(0, 5).map(r => r.id);
    const days = week({ banned: lunches });
    const used = new Set(days.flatMap(d => d.meals.map(m => m.recipe.id)));
    for (const id of lunches) expect(used.has(id)).toBe(false);
  });

  /**
   * Любимым отдаётся примерно половина меню, а не всё: иначе набор схлопывается
   * до пары блюд и «нравится» превращается в наказание.
   */
  it("«палец вверх» ставит блюдо чаще, но не вытесняет остальные", () => {
    const pool = filterRecipes(RECIPES, CONSTRAINTS);
    const liked = pool.filter(r => r.meal_type === "dinner").slice(0, 3).map(r => r.id);
    const countLiked = (ids: string[], opts: Parameters<typeof week>[0]) => {
      const dinners = week(opts).flatMap(d => d.meals.filter(m => m.slot === "dinner"));
      return dinners.filter(m => ids.includes(m.recipe.id)).length;
    };
    const before = countLiked(liked, {});
    const after = countLiked(liked, { liked });
    expect(after).toBeGreaterThan(before);

    const names = new Set(week({ liked }).flatMap(d => d.meals.map(m => m.recipe.id)));
    expect(names.size).toBeGreaterThan(liked.length + 3);   // меню не схлопнулось в любимое
  });

  it("оценки не ломают цель дня по калориям и белку", () => {
    const pool = filterRecipes(RECIPES, CONSTRAINTS);
    const liked = pool.filter(r => r.meal_type === "lunch").slice(0, 2).map(r => r.id);
    for (const day of week({ liked })) {
      expect(day.totals.kcal).toBeGreaterThan(targets.kcalTarget * 0.85);
      expect(day.totals.kcal).toBeLessThan(targets.kcalTarget * 1.15);
      expect(day.totals.protein).toBeGreaterThanOrEqual(targets.proteinGTarget * 0.8);
    }
  });
});
