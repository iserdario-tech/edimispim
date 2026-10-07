import { describe, it, expect } from "vitest";
import recipes from "../src/food/data/recipes.json";
import { planWindow, filterRecipes, targetsForToday, expectedBedMin } from "../src/food/index";
import { targetsFor, type FoodSettings } from "../src/ui/storage";
import { dayOptsFor } from "../src/ui/dayOpts";

/**
 * Неделя не повторяет прошлую. Блюдо дня выбиралось как offset·L/7, и день N+7 попадал
 * в тот же индекс, что день N: 5–7 из 14 обедов и ужинов совпадали с прошлой неделей.
 * Сдвиг недели (WEEK_PHASE) снизил это до ~4, и тест держит планку.
 */
const food = {
  profile: { sex: "m", age: 33, heightCm: 180, weightKg: 93, goalWeightKg: 82, activity: "low" },
  constraints: { allergens: [], cookware: ["stove", "oven", "microwave"], budget: "medium", cuisines: [], dislikes: [] },
  mealCount: 4, pace: "normal", startISO: "2026-08-27", tuned: true,
} as unknown as FoodSettings;

describe("разнообразие недель", () => {
  it("обеды и ужины недели в среднем совпадают с прошлой не больше чем на треть", () => {
    const safe = targetsFor(food);
    const pool = filterRecipes(recipes as never, { ...food.constraints, bannedIds: [] } as never);
    const days = planWindow("2026-10-08", 84, pool,
      iso => targetsForToday(safe, food.startISO, iso, food.pace).targets,
      iso => dayOptsFor(food, iso, { wakeMin: 420, bedMin: expectedBedMin(420, 480) }, [], [], safe));
    const mains = (w: number) => days.slice(w * 7, w * 7 + 7)
      .flatMap(d => d.day.meals.filter(m => m.slot === "lunch" || m.slot === "dinner").map(m => m.recipe.id));
    let same = 0;
    for (let w = 1; w < 12; w++) { const prev = new Set(mains(w - 1)); same += mains(w).filter(id => prev.has(id)).length; }
    expect(same / 11).toBeLessThan(14 / 3);
  });
});
