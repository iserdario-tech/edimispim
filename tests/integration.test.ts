import { describe, it, expect } from "vitest";
import { computeTargets } from "../src/food/targets";
import { applySafety } from "../src/food/safety";
import { generateWeek, filterRecipes, mealTimes } from "../src/food/planner";
import { generateAdaptedDay } from "../src/food/adapt";
import { buildGroceryList } from "../src/food/grocery";
import { migrateAll, POSPAT_KEY, OHEEDET_KEY } from "../src/migrate";
import { explain } from "../src/explain";
import { upsertDay, type DayRecord } from "../src/day-log";
import { stopBang, nightEating } from "../src/screening";
import { parseHM, fmtHM } from "../src/time";
import recipesJson from "../src/food/data/recipes.json";
import type { Recipe } from "../src/food/types";
import type { StorageLike } from "../src/ui/storage";

const recipes = recipesJson as Recipe[];

/** Сквозной прогон на настоящих 36 рецептах: онбординг → цели → неделя → покупки. */
describe("сквозной прогон реального пайплайна", () => {
  const profile = { sex: "m" as const, age: 33, heightCm: 180, weightKg: 88, goalWeightKg: 80, activity: "low" as const };
  const constraints = { allergens: [], cookware: ["stove", "oven", "microwave", "blender"], budget: "medium" as const, cuisines: [], dislikes: [] };
  const rhythm = { wakeMin: parseHM("07:00"), bedMin: parseHM("23:00") };

  const safe = applySafety(computeTargets(profile), profile, { scoffScore: 0, conditions: [] });

  it("цели считаются и проходят guardrails", () => {
    expect(safe.kcalTarget).toBeGreaterThan(1500);
    expect(safe.referDoctor).toBe(false);
    expect(safe.proteinGTarget).toBe(128);
  });

  it("неделя собирается на реальных рецептах и держит дефицит каждый день", () => {
    const week = generateWeek(safe, recipes, { rhythm, constraints });
    expect(week).toHaveLength(7);
    for (const day of week) {
      expect(day.meals.length).toBe(4);
      // ±15 % — тот же допуск, что был в oheedet
      expect(Math.abs(day.totals.kcal - safe.kcalTarget)).toBeLessThanOrEqual(safe.kcalTarget * 0.15);
      expect(day.totals.protein).toBeGreaterThan(safe.proteinGTarget * 0.7);
    }
  });

  it("ужин каждый день ровно за 3 часа до отбоя, приёмы не наезжают друг на друга", () => {
    const week = generateWeek(safe, recipes, { rhythm, constraints });
    for (const day of week) {
      const dinner = day.meals.find(m => m.slot === "dinner")!;
      expect(fmtHM(dinner.timeMin)).toBe("20:00");
      const times = day.meals.map(m => m.timeMin);
      expect([...times].sort((a, b) => a - b)).toEqual(times);   // уже отсортированы
      expect(new Set(times).size).toBe(times.length);
    }
  });

  it("покупки собираются с ценой и скоропортом", () => {
    const week = generateWeek(safe, recipes, { rhythm, constraints });
    const g = buildGroceryList(week);
    expect(g.items.length).toBeGreaterThan(10);
    expect(g.estCostRub).toBeGreaterThan(0);
    expect(g.byDay).toHaveLength(7);
    expect(g.byDay.some(d => d.hasPerishable)).toBe(true);
    // канонизация имён: дублей «яйцо/яйца» быть не должно
    const names = g.items.map(i => (i.name + "|" + i.unit).toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("поздний отбой двигает весь день, а не только ужин", () => {
    const late = mealTimes({ wakeMin: parseHM("09:00"), bedMin: parseHM("01:00") + 1440 }, 4);
    const early = mealTimes(rhythm, 4);
    expect(late.dinner!).toBeGreaterThan(early.dinner!);
    expect(late.breakfast!).toBeGreaterThan(early.breakfast!);
  });
});

/** Главный сценарий продукта: человек переезжает из двух приложений и получает связный день. */
describe("сценарий переезда и первого дня", () => {
  const pospatState = {
    profile: { anchorWakeHM: "07:00", targetSleepMin: 465, chronotype: "intermediate", caffeine: { typicalMgPerDose: 100, regularUser: true }, napPossibleByDefault: false, goal: "alertness" },
    history: Array.from({ length: 7 }, (_, i) => ({
      date: `2026-07-${String(19 + i).padStart(2, "0")}`,
      wokeHM: "07:00", bedHM: "01:30", quality: 3 as const,     // хронический недосып
    })),
    screener: null,
  };
  const oheedetState = {
    profile: { sex: "m", age: 33, heightCm: 180, weightKg: 88, goalWeightKg: 80, activity: "low" },
    constraints: { allergens: [], cookware: ["stove", "oven"], budget: "medium", cuisines: [], dislikes: [] },
    screen: { conditions: [], scoffScore: 0 },
    progress: { done: { "0": true }, weights: [{ date: "2026-07-19", kg: 88.0 }, { date: "2026-07-25", kg: 87.1 }] },
  };
  const store: StorageLike = {
    getItem: k => (k === POSPAT_KEY ? JSON.stringify(pospatState) : k === OHEEDET_KEY ? JSON.stringify(oheedetState) : null),
    setItem: () => {},
  };

  it("данные обоих приложений сливаются в один ряд суток", () => {
    const m = migrateAll(store);
    expect(m.days).toHaveLength(7);
    const first = m.days.find(d => d.date === "2026-07-19")!;
    expect(first.sleep?.quality).toBe(3);       // из pospat
    expect(first.body?.weightKg).toBe(88.0);    // из oheedet
    expect(m.sleepProfile?.anchorWakeHM).toBe("07:00");
    expect(m.foodProfile?.weightKg).toBe(88);
  });

  it("ГЛАВНОЕ: вес падает на недосыпе → приложение говорит про состав потери", () => {
    const m = migrateAll(store);
    const today = m.days[m.days.length - 1]!;
    const e = explain({ today, days: m.days, targetSleepMin: 465 });
    expect(e.kind).toBe("scale_truth");
    expect(e.textRU).toMatch(/мышц/);
  });

  it("после плохой ночи день реально проще, а калораж тот же", () => {
    const profile = { sex: "m" as const, age: 33, heightCm: 180, weightKg: 88, goalWeightKg: 80, activity: "low" as const };
    const safe = applySafety(computeTargets(profile), profile, {});
    const rhythm = { wakeMin: parseHM("07:00"), bedMin: parseHM("23:00") };
    const pool = filterRecipes(recipes, { cookware: ["stove", "oven", "microwave", "blender"] });

    const normal = generateAdaptedDay(safe, pool, { rhythm }, { sleptMin: 470, targetSleepMin: 465, quality: 4 });
    const rough = generateAdaptedDay(safe, pool, { rhythm }, { sleptMin: 330, targetSleepMin: 465, quality: 2 });

    const cook = (d: typeof normal) => d.meals.reduce((s, m) => s + (m.recipe.time_min ?? 0), 0);
    expect(cook(rough)).toBeLessThan(cook(normal));
    expect(rough.totals.kcal).toBeLessThanOrEqual(safe.kcalTarget * 1.08);
    expect(rough.simplified).toBe(true);
    // лакомство перенесено на вечер — как замена срыву, а не добавка
    const treat = rough.meals.find(m => m.slot === "dessert")!;
    const dinner = rough.meals.find(m => m.slot === "dinner")!;
    expect(treat.timeMin).toBeGreaterThan(dinner.timeMin);
  });

  it("человек с апноэ и ночной едой получает смягчённую цель, а не жёсткий дефицит", () => {
    const profile = { sex: "m" as const, age: 55, heightCm: 175, weightKg: 115, activity: "low" as const };
    const bmi = profile.weightKg / (profile.heightCm / 100) ** 2;
    const apnea = stopBang(
      { snoringLoud: true, tiredDaytime: true, observedApnea: true, highBloodPressure: true, neckOver40cm: true },
      { bmi, age: profile.age, sex: profile.sex },
    );
    const nes = nightEating({
      eveningHyperphagia: true, nightEatingTwicePlus: false, morningAnorexia: true,
      urgeToEatBeforeSleep: true, insomnia: true, mustEatToSleep: false,
      eveningMoodDrop: false, distress: true,
    });
    expect(apnea.levelRU).toBe("высокий");
    expect(nes.flagged).toBe(true);

    const safe = applySafety(computeTargets(profile), profile, { nesFlagged: nes.flagged });
    expect(safe.referDoctor).toBe(true);
    expect(safe.kcalTarget).toBeGreaterThanOrEqual(safe.tdee - 300);
  });

  it("новый день дописывается в ряд, ничего не теряя", () => {
    const m = migrateAll(store);
    let days: DayRecord[] = m.days;
    days = upsertDay(days, { date: "2026-07-26", sleep: { wokeHM: "07:10", bedHM: "23:20", quality: 4 } });
    days = upsertDay(days, { date: "2026-07-26", food: { followed: true, plannedKcal: 1700 } });
    expect(days).toHaveLength(8);
    const last = days[days.length - 1]!;
    expect(last.sleep?.quality).toBe(4);
    expect(last.food?.followed).toBe(true);
  });
});
