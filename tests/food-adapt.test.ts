import { describe, it, expect } from "vitest";
import { generateAdaptedDay, isRoughNight, simplifyPool } from "../src/food/adapt";
import { generateDay } from "../src/food/planner";
import { parseHM } from "../src/time";
import recipesJson from "../src/food/data/recipes.json";
import type { Recipe, Targets } from "../src/food/types";

const recipes = recipesJson as Recipe[];
const targets: Targets = { bmr: 1400, tdee: 2250, kcalTarget: 1700, proteinGTarget: 120, fiberGTarget: 30, tempoKgPerWeek: 0.5 };
const rhythm = { wakeMin: parseHM("07:00"), bedMin: parseHM("23:00") };
const rough = { sleptMin: 300, targetSleepMin: 465, quality: 2 as const };
const good = { sleptMin: 470, targetSleepMin: 465, quality: 4 as const };

describe("isRoughNight", () => {
  it("низкое качество — плохая ночь даже при достаточной длительности", () => {
    expect(isRoughNight({ sleptMin: 480, targetSleepMin: 465, quality: 2 })).toBe(true);
  });
  it("недобор больше часа — плохая ночь даже при нормальном качестве", () => {
    expect(isRoughNight({ sleptMin: 380, targetSleepMin: 465, quality: 4 })).toBe(true);
  });
  it("недобор меньше часа — не плохая ночь", () => {
    expect(isRoughNight({ sleptMin: 420, targetSleepMin: 465, quality: 4 })).toBe(false);
  });
  it("нет данных — не выдумываем плохую ночь", () => {
    expect(isRoughNight(undefined)).toBe(false);
    expect(isRoughNight({})).toBe(false);
  });
});

describe("simplifyPool", () => {
  it("оставляет самые простые блюда каждого типа", () => {
    const simple = simplifyPool(recipes);
    // усилие = сложность, при равной сложности — время; поэтому сравниваем среднее,
    // а не максимум по времени: блюдо d1 на 20 минут проще, чем d2 на 15.
    const avgEffort = (rs: Recipe[]) =>
      rs.reduce((s, r) => s + (r.difficulty ?? 1) * 1000 + (r.time_min ?? 0), 0) / rs.length;
    for (const type of ["breakfast", "lunch", "dinner", "dessert"] as const) {
      const kept = simple.filter(r => r.meal_type === type);
      const all = recipes.filter(r => r.meal_type === type);
      expect(kept.length).toBeGreaterThanOrEqual(2);       // есть куда заменять
      expect(kept.length).toBeLessThan(all.length);        // пул реально сузился
      expect(avgEffort(kept)).toBeLessThan(avgEffort(all));
    }
  });

  it("не падает на крошечном пуле — плану всегда есть из чего собраться", () => {
    const tiny = recipes.filter(r => r.meal_type === "dinner").slice(0, 1);
    expect(simplifyPool(tiny)).toHaveLength(1);
  });
});

describe("generateAdaptedDay", () => {
  it("ГЛАВНОЕ: после плохой ночи калораж НЕ растёт (B1)", () => {
    const normal = generateDay(targets, recipes, { rhythm });
    const adapted = generateAdaptedDay(targets, recipes, { rhythm }, rough);
    expect(adapted.totals.kcal).toBeLessThanOrEqual(targets.kcalTarget * 1.08);
    expect(adapted.totals.kcal).toBeLessThanOrEqual(normal.totals.kcal * 1.08);
  });

  it("после плохой ночи день помечен как упрощённый и готовки меньше", () => {
    const normal = generateDay(targets, recipes, { rhythm });
    const adapted = generateAdaptedDay(targets, recipes, { rhythm }, rough);
    expect(adapted.simplified).toBe(true);
    const cookTime = (d: typeof normal) => d.meals.reduce((s, m) => s + (m.recipe.time_min ?? 0), 0);
    expect(cookTime(adapted)).toBeLessThanOrEqual(cookTime(normal));
  });

  it("после плохой ночи калораж сдвинут вперёд: ужин легче (B1)", () => {
    const normal = generateDay(targets, recipes, { rhythm });
    const adapted = generateAdaptedDay(targets, recipes, { rhythm }, rough);
    const dinnerKcal = (d: typeof normal) => {
      const m = d.meals.find(x => x.slot === "dinner")!;
      return m.recipe.kcal * m.servings;
    };
    expect(dinnerKcal(adapted) / adapted.totals.kcal).toBeLessThan(dinnerKcal(normal) / normal.totals.kcal);
  });

  it("после хорошей ночи план обычный", () => {
    const adapted = generateAdaptedDay(targets, recipes, { rhythm }, good);
    expect(adapted.simplified).toBeUndefined();
  });
});
