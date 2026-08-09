import { describe, it, expect } from "vitest";
import { generateWeek } from "../src/food/planner";
import recipesJson from "../src/food/data/recipes.json";
import type { Recipe, SafeTargets, MealCount } from "../src/food/types";

const RECIPES = recipesJson as Recipe[];
const CONSTRAINTS = { cookware: ["stove", "oven", "microwave", "blender", "multicooker", "airfryer"] };

const targets = (kcal: number): SafeTargets => ({
  bmr: 1700, tdee: 2300, kcalTarget: kcal, proteinGTarget: 128, fiberGTarget: 30,
  tempoKgPerWeek: 0.5, flags: [], referDoctor: false,
});
const week = (kcal: number, mealCount: MealCount) =>
  generateWeek(targets(kcal), RECIPES, {
    rhythm: { wakeMin: 420, bedMin: 1380 }, mealCount, constraints: CONSTRAINTS,
  });

/**
 * Живой человек не ест семь дней подряд одно и то же.
 *
 * Раньше каждый день собирался независимо от остальных, и на цели по калориям неделя
 * давала три разных обеда из семи — при шестидесяти одном подходящем блюде в базе.
 * Планировщик просто не знал, что вчера был тот же обед. Здесь проверяется именно это
 * знание: не «алгоритм такой-то», а результат — сколько разной еды видит человек.
 */
describe("разнообразие недели", () => {
  for (const kcal of [1750, 2300]) {
    for (const mealCount of [2, 3, 4, 5] as MealCount[]) {
      it(`${kcal} ккал, ${mealCount} приёма: ни один приём не повторяется за неделю`, () => {
        const days = week(kcal, mealCount);
        for (const slot of ["breakfast", "lunch", "dinner", "snack", "dessert"] as const) {
          const used = days.flatMap(d => d.meals.filter(m => m.slot === slot).map(m => m.recipe.id));
          if (!used.length) continue;
          expect(new Set(used).size, `${slot}: ${used.length} приёмов, разных ${new Set(used).size}`)
            .toBe(used.length);
        }
      });
    }
  }

  /** Перекус и десерт одного дня берутся из одного пула — и не должны совпасть. */
  it("сладкие слоты одного дня не дублируют друг друга", () => {
    for (const day of week(1750, 5)) {
      const treats = day.meals.filter(m => m.slot === "dessert" || m.slot === "snack");
      expect(new Set(treats.map(m => m.recipe.id)).size).toBe(treats.length);
    }
  });

  /** Разнообразие не должно покупаться ценой цели дня. */
  it("цель дня остаётся выдержанной", () => {
    for (const mealCount of [2, 3, 4, 5] as MealCount[]) {
      for (const day of week(1750, mealCount)) {
        expect(day.totals.kcal).toBeGreaterThan(1750 * 0.85);
        expect(day.totals.kcal).toBeLessThan(1750 * 1.15);
        expect(day.totals.protein).toBeGreaterThanOrEqual(128 * 0.8);
      }
    }
  });
});
