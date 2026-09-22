import { describe, it, expect } from "vitest";
import { generateDay } from "../src/food/planner";
import { generateAdaptedDay, nightChanges } from "../src/food/adapt";
import { parseHM } from "../src/time";
import type { Recipe, Targets } from "../src/food/types";
import recipesJson from "../src/food/data/recipes.json";

const ALL = recipesJson as Recipe[];
const targets: Targets = { bmr: 1700, tdee: 2300, kcalTarget: 1800, proteinGTarget: 130, fiberGTarget: 30, tempoKgPerWeek: 0.5 };
const opts = { rhythm: { wakeMin: parseHM("07:00"), bedMin: parseHM("23:00") }, mealCount: 4 as const, offset: 2 };

describe("что поменялось из-за ночи", () => {
  const normal = generateDay(targets, ALL, opts);
  const rough = generateAdaptedDay(targets, ALL, opts, { quality: 1 });

  it("обычный день против обычного — изменений нет", () => {
    expect(nightChanges(normal, normal)).toEqual([]);
  });
  it("после плохой ночи называет перенос сладкого с временем", () => {
    const c = nightChanges(normal, rough);
    expect(c.some(s => /Сладкое/.test(s) && /\d\d:\d\d вместо \d\d:\d\d/.test(s))).toBe(true);
  });
  it("говорит про сдвиг калорий к утру", () => {
    expect(nightChanges(normal, rough).some(s => /к утру/.test(s))).toBe(true);
  });
  it("каждая строка — одно изменение, без повторов", () => {
    const c = nightChanges(normal, rough);
    expect(new Set(c).size).toBe(c.length);
    expect(c.length).toBeLessThanOrEqual(3);
  });
});
