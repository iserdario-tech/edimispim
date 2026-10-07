import { describe, it, expect } from "vitest";
import { generateDay } from "../src/food/planner";
import { planBlock, applySwaps } from "../src/food/schedule";
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

describe("готовлю сразу на 2–3 дня", () => {
  const slotOf = (d: ReturnType<typeof generateDay>, slot: string) => d.meals.find(m => m.slot === slot)!;
  it("на 2 дня: обед и ужин дня готовки повторяются назавтра, готовить их не надо", () => {
    const week = planBlock("2026-09-21", ALL, () => targets, () => ({ rhythm, mealCount: 4, cookDays: 2 }));
    for (const i of [1, 3, 5]) {
      for (const slot of ["lunch", "dinner"]) {
        const cooked = slotOf(week[i - 1]!.day, slot), warmed = slotOf(week[i]!.day, slot);
        expect(warmed.recipe.id, `${slot} дня ${i}`).toBe(cooked.recipe.id);
        expect(warmed.leftover).toBe(true);
        expect(warmed.servings).toBeGreaterThanOrEqual(0.5);
        expect(warmed.servings).toBeLessThanOrEqual(2);
      }
      expect(week[i]!.potISO).toBe(week[i - 1]!.iso);
      // завтрак свой каждый день
      expect(slotOf(week[i]!.day, "breakfast").leftover).toBeFalsy();
    }
    // дни готовки не повторяют друг друга
    const dinners = [0, 2, 4, 6].map(i => slotOf(week[i]!.day, "dinner").recipe.id);
    expect(new Set(dinners).size).toBe(4);
  });
  it("на 3 дня: два дня подряд из одной кастрюли", () => {
    const week = planBlock("2026-09-21", ALL, () => targets, () => ({ rhythm, mealCount: 4, cookDays: 3 }));
    for (const i of [1, 2, 4, 5]) {
      const from = i < 3 ? 0 : 3;
      expect(slotOf(week[i]!.day, "dinner").recipe.id).toBe(slotOf(week[from]!.day, "dinner").recipe.id);
      expect(slotOf(week[i]!.day, "lunch").recipe.id).toBe(slotOf(week[from]!.day, "lunch").recipe.id);
    }
  });
  it("калории дня в ±3 % и в дни «разогреть»", () => {
    const week = planBlock("2026-09-21", ALL, () => targets, () => ({ rhythm, mealCount: 4, cookDays: 2 }));
    for (const d of week) expect(Math.abs(d.day.totals.kcal - targets.kcalTarget) / targets.kcalTarget, d.iso).toBeLessThanOrEqual(0.03);
  });
  // блок семидневки начинается не с даты запроса, а с границы от эпохи — день готовки берём по нему
  const first = planBlock("2026-09-21", ALL, () => targets, () => ({ rhythm, mealCount: 4 }))[0]!.iso;
  it("замена ужина в день готовки меняет и то, что разогревают назавтра", () => {
    const other = ALL.find(r => r.meal_type === "dinner" && r.id !== slotOf(planBlock(first, ALL, () => targets, () => ({ rhythm, mealCount: 4, cookDays: 2 }))[0]!.day, "dinner").recipe.id)!;
    const week = planBlock(first, ALL, () => targets, () => ({ rhythm, mealCount: 4, cookDays: 2 }),
      d => { if (d.iso === first) applySwaps(d.day, { dinner: other.id }, ALL, targets, 4); });
    expect(slotOf(week[0]!.day, "dinner").recipe.id).toBe(other.id);
    expect(slotOf(week[1]!.day, "dinner").recipe.id).toBe(other.id);
  });
  it("в день «не готовлю» кастрюли нет — назавтра готовят заново", () => {
    const week = planBlock("2026-09-21", ALL, () => targets,
      iso => ({ rhythm, mealCount: 4, cookDays: 2, ...(iso === first ? { noCook: true, maxCookMin: 10 } : {}) }));
    expect(slotOf(week[1]!.day, "dinner").leftover).toBeFalsy();
  });
  it("без настройки еда из кастрюли не появляется", () => {
    const week = planBlock("2026-09-21", ALL, () => targets, () => ({ rhythm, mealCount: 4 }));
    expect(week.every(d => d.day.meals.every(m => !m.leftover))).toBe(true);
  });
});
