import { describe, it, expect } from "vitest";
import { planWindow, scheduleFor, isoOfDay, dayNumber, applySwaps } from "../src/food/schedule";
import { filterRecipes } from "../src/food/planner";
import recipesJson from "../src/food/data/recipes.json";
import type { Recipe, SafeTargets } from "../src/food/types";

const RECIPES = recipesJson as Recipe[];
const pool = filterRecipes(RECIPES, {
  cookware: ["stove", "oven", "microwave", "blender", "multicooker", "airfryer"],
});
const targets: SafeTargets = {
  bmr: 1700, tdee: 2300, kcalTarget: 1750, proteinGTarget: 128, fiberGTarget: 30,
  tempoKgPerWeek: 0.5, flags: [], referDoctor: false,
};
const targetsOf = () => targets;
const optsOf = () => ({ rhythm: { wakeMin: 420, bedMin: 1380 }, mealCount: 4 as const });
const names = (d: { day: { meals: { recipe: { name: string } }[] } }) =>
  d.day.meals.map(m => m.recipe.name).join(" | ");

const DATES = ["2026-08-09", "2026-08-10", "2026-08-12", "2026-08-14", "2026-09-01", "2027-01-31"];

describe("меню привязано к календарю", () => {
  /**
   * «Сегодня» и первый день «Еды» — это один и тот же день.
   *
   * Раньше номер дня на «Сегодня» брался из дня недели, а на «Еде» — из позиции в
   * семидневке. Совпадали они только по воскресеньям, а в остальные дни человек видел
   * на двух экранах разный обед.
   */
  it.each(DATES)("%s: «Сегодня» и первый день «Еды» совпадают", iso => {
    expect(names(scheduleFor(iso, pool, targetsOf, optsOf)))
      .toBe(names(planWindow(iso, 7, pool, targetsOf, optsOf)[0]!));
  });

  /**
   * План держит слово: что обещано на завтра, то завтра и будет.
   *
   * Раньше завтрашний день назавтра становился «днём номер ноль» и подменялся другим
   * блюдом. Список покупок при этом собирался под меню, которое никогда не наступит.
   */
  it.each(DATES)("%s: обещанное на завтра наступает завтра", iso => {
    const promised = planWindow(iso, 7, pool, targetsOf, optsOf);
    const tomorrow = isoOfDay(dayNumber(iso) + 1);
    const actual = planWindow(tomorrow, 7, pool, targetsOf, optsOf);
    expect(names(actual[0]!)).toBe(names(promised[1]!));
  });

  /** Окно может задевать две семидневки — оно всё равно должно быть длиной ровно семь. */
  it("окно всегда семь дней подряд", () => {
    const days = planWindow("2026-08-13", 7, pool, targetsOf, optsOf);
    expect(days).toHaveLength(7);
    for (let i = 1; i < days.length; i++) {
      expect(dayNumber(days[i]!.iso)).toBe(dayNumber(days[i - 1]!.iso) + 1);
    }
  });

  /** Внутри одной семидневки еда не повторяется — окно на стыке блоков это не ломает. */
  it("день не повторяет сам себя внутри блока", () => {
    for (const iso of DATES) {
      const days = planWindow(iso, 7, pool, targetsOf, optsOf);
      for (const d of days) {
        const ids = d.day.meals.map(m => m.recipe.id);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });
});

/**
 * Замена руками должна пережить перезагрузку: раньше она жила только в памяти вкладки,
 * и стоило обновить страницу — возвращалось блюдо, выбранное планировщиком.
 */
describe("ручные замены поверх плана", () => {
  const day = () => planWindow("2026-08-09", 1, pool, targetsOf, optsOf)[0]!;

  it("сохранённая замена встаёт на своё место", () => {
    const d = day();
    const slot = d.day.meals[0]!.slot;
    const other = pool.find(r => r.meal_type === d.day.meals[0]!.recipe.meal_type
      && r.id !== d.day.meals[0]!.recipe.id)!;
    applySwaps(d.day, { [slot]: other.id }, pool, d.targets, 4);
    expect(d.day.meals.find(m => m.slot === slot)!.recipe.id).toBe(other.id);
  });

  it("исчезнувшее из набора блюдо не оставляет приём пустым", () => {
    const d = day();
    const slot = d.day.meals[0]!.slot;
    const before = d.day.meals.find(m => m.slot === slot)!.recipe.id;
    applySwaps(d.day, { [slot]: "такого-рецепта-нет" }, pool, d.targets, 4);
    expect(d.day.meals.find(m => m.slot === slot)!.recipe.id).toBe(before);
  });

  it("день пересчитывается под новую еду", () => {
    const d = day();
    const slot = d.day.meals[0]!.slot;
    const other = pool.filter(r => r.meal_type === d.day.meals[0]!.recipe.meal_type)
      .sort((a, b) => b.kcal - a.kcal)[0]!;
    applySwaps(d.day, { [slot]: other.id }, pool, d.targets, 4);
    const sum = d.day.meals.reduce((s, m) => s + Math.round(m.recipe.kcal * m.servings), 0);
    expect(d.day.totals.kcal).toBe(sum);
  });
});
