import { describe, it, expect } from "vitest";
import { rampIn, targetsForToday, prefersFamiliar, RAMP_DAYS } from "../src/food/rampin";
import { generateDay, filterRecipes } from "../src/food/planner";
import recipesJson from "../src/food/data/recipes.json";
import type { Recipe, SafeTargets } from "../src/food/types";

const RECIPES = recipesJson as Recipe[];
const ALL_COOKWARE = ["stove", "oven", "microwave", "blender", "multicooker", "airfryer"];

const targets: SafeTargets = {
  bmr: 1700, tdee: 2400, kcalTarget: 1800, proteinGTarget: 130, fiberGTarget: 30,
  tempoKgPerWeek: 0.5, flags: [], referDoctor: false,
};

/**
 * «Если я обжора, то с первого дня питаться на таком дефиците — это пиздец».
 * Проверяем ровно это обещание: в первый день ешь как привык, к концу лестницы — цель,
 * и ни в один день калораж не прыгает вверх.
 */
describe("плавное вхождение в дефицит", () => {
  it("в первый день — поддерживающий калораж, а не цель", () => {
    const r = rampIn(targets, "2026-08-07", "2026-08-07", "normal");
    expect(r.kcalToday).toBe(targets.tdee);
    expect(r.active).toBe(true);
    expect(r.day).toBe(1);
  });

  it("в последний день лестницы — ровно цель", () => {
    const r = rampIn(targets, "2026-08-07", "2026-08-20", "normal");   // 14-й день
    expect(r.day).toBe(RAMP_DAYS.normal);
    expect(r.kcalToday).toBe(targets.kcalTarget);
  });

  it("после лестницы вхождение выключается", () => {
    const r = rampIn(targets, "2026-08-07", "2026-09-01", "normal");
    expect(r.active).toBe(false);
    expect(r.kcalToday).toBe(targets.kcalTarget);
    expect(r.labelRU).toBe("");
  });

  it("калораж только снижается — ни одного дня вверх", () => {
    const days = ["2026-08-07", "2026-08-08", "2026-08-09", "2026-08-10", "2026-08-11",
      "2026-08-12", "2026-08-13", "2026-08-14"];
    const vals = days.map(d => rampIn(targets, "2026-08-07", d, "normal").kcalToday);
    for (let i = 1; i < vals.length; i++) expect(vals[i]!).toBeLessThanOrEqual(vals[i - 1]!);
  });

  it("«мягко» растягивает вход на три недели, «сразу» его отключает", () => {
    expect(rampIn(targets, "2026-08-07", "2026-08-15", "gentle").active).toBe(true);
    expect(rampIn(targets, "2026-08-07", "2026-08-15", "none").active).toBe(false);
    expect(rampIn(targets, "2026-08-07", "2026-08-15", "none").kcalToday).toBe(targets.kcalTarget);
  });

  it("белок и клетчатка не снижаются вместе с калориями — они и есть смысл плана", () => {
    const { targets: t } = targetsForToday(targets, "2026-08-07", "2026-08-08", "normal");
    expect(t.proteinGTarget).toBe(targets.proteinGTarget);
    expect(t.fiberGTarget).toBe(targets.fiberGTarget);
    expect(t.kcalTarget).toBeGreaterThan(targets.kcalTarget);
  });

  it("без даты старта ничего не меняется — старые данные не ломаются", () => {
    const { targets: t, ramp } = targetsForToday(targets, undefined, "2026-08-08");
    expect(t).toEqual(targets);
    expect(ramp.active).toBe(false);
  });

  it("если TDEE ниже цели, спускаться некуда и цель не растёт", () => {
    const odd: SafeTargets = { ...targets, tdee: 1500, kcalTarget: 1800 };
    expect(rampIn(odd, "2026-08-07", "2026-08-07", "normal").kcalToday).toBe(1800);
  });

  it("привычная еда — в первой половине входа, дальше обычный набор", () => {
    expect(prefersFamiliar(rampIn(targets, "2026-08-07", "2026-08-07", "normal"))).toBe(true);
    expect(prefersFamiliar(rampIn(targets, "2026-08-07", "2026-08-13", "normal"))).toBe(true);
    expect(prefersFamiliar(rampIn(targets, "2026-08-07", "2026-08-19", "normal"))).toBe(false);
    expect(prefersFamiliar(rampIn(targets, undefined, "2026-08-07"))).toBe(false);
  });

  /**
   * Обещание пункта: «на первой неделе приоритет блюдам, которые ближе к привычной еде».
   * Первая версия делала обратное — ставила потолок по плотности и выбрасывала как раз
   * пасту и жаркое. Поэтому проверяем не вызов функции, а результат на реальном наборе:
   * еда действительно плотнее, а калораж и белок при этом не поехали.
   */
  it("«привычно» даёт более плотную еду, не ломая калораж и белок", () => {
    const pool = filterRecipes(RECIPES, { cookware: ALL_COOKWARE });
    const week = (familiar: boolean) => [...Array(7)].map((_, d) =>
      generateDay(targets, pool, { rhythm: { wakeMin: 420, bedMin: 1380 }, mealCount: 4, offset: d, familiar }));
    const density = (days: ReturnType<typeof week>) => {
      const meals = days.flatMap(x => x.meals);
      return meals.reduce((s, m) => s + (m.recipe.energy_density ?? 0), 0) / meals.length;
    };
    const plain = week(false), familiar = week(true);
    expect(density(familiar)).toBeGreaterThan(density(plain));
    for (const day of familiar) {
      expect(day.totals.kcal).toBeLessThan(targets.kcalTarget * 1.15);
      expect(day.totals.protein).toBeGreaterThanOrEqual(targets.proteinGTarget * 0.85);
    }
  });
});
