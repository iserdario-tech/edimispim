import { describe, it, expect } from "vitest";
import { generateDay } from "../src/food/planner";
import { planBlock } from "../src/food/schedule";
import { parseHM } from "../src/time";
import type { Recipe, Targets } from "../src/food/types";
import recipesJson from "../src/food/data/recipes.json";

const ALL = recipesJson as Recipe[];
const targets: Targets = { bmr: 1700, tdee: 2300, kcalTarget: 1800, proteinGTarget: 130, fiberGTarget: 30, tempoKgPerWeek: 0.5 };
const rhythm = { wakeMin: parseHM("07:00"), bedMin: parseHM("23:00") };
const mains = (d: ReturnType<typeof generateDay>) => d.meals.filter(m => ["breakfast", "lunch", "dinner"].includes(m.slot));

describe("время на готовку", () => {
  it("основные блюда укладываются в лимит, когда такие есть", () => {
    for (let offset = 0; offset < 7; offset++) {
      const d = generateDay(targets, ALL, { rhythm, mealCount: 4, offset, maxCookMin: 30 });
      for (const m of mains(d)) expect(m.recipe.time_min ?? 0).toBeLessThanOrEqual(30);
    }
  });
  it("«не готовлю» — до 10 минут, и день всё равно не пустой", () => {
    const d = generateDay(targets, ALL, { rhythm, mealCount: 4, offset: 3, maxCookMin: 10 });
    expect(mains(d).length).toBe(3);
  });
  it("если в слоте нет блюд в лимите — берётся весь список, а не пустой приём", () => {
    const slow: Recipe[] = ALL.filter(r => r.meal_type !== "dinner")
      .concat(ALL.filter(r => r.meal_type === "dinner").map(r => ({ ...r, time_min: 90 })));
    const d = generateDay(targets, slow, { rhythm, mealCount: 3, offset: 0, maxCookMin: 20 });
    expect(d.meals.some(m => m.slot === "dinner")).toBe(true);
  });
});

describe("готовить на два дня", () => {
  it("обед следующего дня — остатки вчерашнего ужина, в нормальной порции", () => {
    const week = planBlock("2026-09-21", ALL, () => targets, () => ({ rhythm, mealCount: 4, leftovers: true }));
    let hits = 0;
    for (let i = 1; i < week.length; i++) {
      const prevDinner = week[i - 1]!.day.meals.find(m => m.slot === "dinner")!;
      const lunch = week[i]!.day.meals.find(m => m.slot === "lunch")!;
      if (!lunch.leftover) continue;       // вчерашнее блюдо не тянет на обед — готовится обычный
      hits++;
      expect(lunch.recipe.id).toBe(prevDinner.recipe.id);
      expect(lunch.servings).toBeGreaterThanOrEqual(0.6);
      expect(lunch.servings).toBeLessThanOrEqual(2);
    }
    expect(hits).toBeGreaterThanOrEqual(4);   // остатки — правило, а не исключение
  });
  it("без опции остатков нет", () => {
    const week = planBlock("2026-09-21", ALL, () => targets, () => ({ rhythm, mealCount: 4 }));
    expect(week.every(d => d.day.meals.every(m => !m.leftover))).toBe(true);
  });
});
