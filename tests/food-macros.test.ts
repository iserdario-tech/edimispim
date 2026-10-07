import { describe, it, expect } from "vitest";
import recipes from "../src/food/data/recipes.json";
import { macrosOf, NUTRIENTS, FAT_CARBS } from "../src/food/nutrients";
import { planWindow, filterRecipes, targetsForToday, expectedBedMin } from "../src/food/index";
import { targetsFor, type FoodSettings } from "../src/ui/storage";
import { dayOptsFor } from "../src/ui/dayOpts";
import type { Recipe } from "../src/food/types";

/**
 * Б/Ж/У. Жиры и углеводы подогнаны под проверенные калории, поэтому 4·Б + 9·Ж + 4·У − 2·клетчатка
 * обязаны сходиться с калориями; а планировщик держит жиры в норме 20–35 % калорий дня.
 */
const food = {
  profile: { sex: "m", age: 33, heightCm: 180, weightKg: 92, goalWeightKg: 82, activity: "low" },
  constraints: { allergens: [], cookware: ["stove", "oven", "microwave"], budget: "medium", cuisines: [], dislikes: [] },
  mealCount: 4, pace: "normal", startISO: "2026-08-27", tuned: true,
} as unknown as FoodSettings;

describe("Б/Ж/У", () => {
  it("у каждого продукта есть жиры и углеводы", () => {
    expect(Object.keys(FAT_CARBS).sort()).toEqual(Object.keys(NUTRIENTS).sort());
  });

  it("жиры и углеводы рецепта — из его состава и сходятся с калориями", () => {
    for (const r of recipes as Recipe[]) {
      const m = macrosOf(r.ingredients ?? []);
      expect([r.id, r.fat_g, r.carbs_g]).toEqual([r.id, m.fat_g, m.carbs_g]);
      const atwater = 4 * r.protein_g + 9 * r.fat_g! + 4 * r.carbs_g! - 2 * r.fiber_g;
      expect(Math.abs(atwater - r.kcal)).toBeLessThanOrEqual(Math.max(5, r.kcal * 0.02));
    }
  });

  it("жиры в меню — 20–35 % калорий почти каждый день", () => {
    const safe = targetsFor(food);
    const pool = filterRecipes(recipes as never, { ...food.constraints, bannedIds: [] } as never);
    const days = planWindow("2026-10-08", 84, pool,
      iso => targetsForToday(safe, food.startISO, iso, food.pace).targets,
      iso => dayOptsFor(food, iso, { wakeMin: 420, bedMin: expectedBedMin(420, 480) }, [], [], safe));
    const share = days.map(d => (9 * d.day.totals.fat) / d.day.totals.kcal);
    expect(share.filter(s => s >= 0.2 && s <= 0.35).length / share.length).toBeGreaterThanOrEqual(0.95);
  });
});
