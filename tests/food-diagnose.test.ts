import { describe, it, expect } from "vitest";
import { diagnosePool } from "../src/food/diagnose";
import { filterRecipes } from "../src/food/planner";
import recipesJson from "../src/food/data/recipes.json";
import type { Recipe } from "../src/food/types";

const recipes = recipesJson as Recipe[];
const ALL_COOKWARE = ["stove", "oven", "microwave", "blender", "multicooker", "airfryer"];

describe("diagnosePool — ограничения незаметно выедают контент", () => {
  it("без ограничений всё в порядке и молчим", () => {
    const d = diagnosePool(recipes, 4);
    expect(d.ok).toBe(true);
    expect(d.messageRU).toBe("");
  });

  // Раньше эти два случая брали настоящий набор рецептов и проверяли «молоко и яйца
  // оставляют один завтрак». Набор вырос со 130 до 190 рецептов, и узкие места
  // разъехались — а проверять надо поведение диагностики, а не количество контента.
  const mk = (id: string, meal_type: Recipe["meal_type"]): Recipe =>
    ({ id, name: id, meal_type, kcal: 300, protein_g: 20, fiber_g: 5, cookware: ["stove"], ingredients: [] });

  it("когда на приём осталось меньше трёх блюд — предупреждаем об однообразии", () => {
    const pool = [mk("b1", "breakfast"), mk("b2", "breakfast"),
      ...Array.from({ length: 5 }, (_, i) => mk(`l${i}`, "lunch")),
      ...Array.from({ length: 5 }, (_, i) => mk(`d${i}`, "dinner")),
      ...Array.from({ length: 5 }, (_, i) => mk(`s${i}`, "dessert"))];
    const d = diagnosePool(pool, 4);
    expect(d.counts.breakfast).toBeLessThan(3);
    expect(d.ok).toBe(true);                       // день ещё собирается
    expect(d.monotonous).toContain("breakfast");
    expect(d.messageRU).toMatch(/повторя/);
  });

  it("когда приём опустел совсем — говорим прямо и подсказываем про аллергии", () => {
    const pool = filterRecipes(recipes, {
      allergens: ["milk", "egg", "fish", "gluten", "nuts", "soy"],
      cookware: ["microwave"],                     // и техника, и аллергии сразу
    });
    const d = diagnosePool(pool, 4);
    expect(d.ok).toBe(false);
    expect(d.missing.length).toBeGreaterThan(0);
    expect(d.messageRU).toMatch(/не осталось/);
    expect(d.messageRU).toMatch(/аллерги|техник/);  // подсказываем, что именно ослабить
  });

  it("схема из 2 приёмов не требует завтрака — и не жалуется на его отсутствие", () => {
    const noBreakfast = recipes.filter(r => r.meal_type !== "breakfast");
    expect(diagnosePool(noBreakfast, 2).missing).not.toContain("breakfast");
    expect(diagnosePool(noBreakfast, 4).missing).toContain("breakfast");
  });

  it("схема из 3 приёмов не требует десерта", () => {
    const noDessert = recipes.filter(r => r.meal_type !== "dessert");
    expect(diagnosePool(noDessert, 3).ok).toBe(true);
    expect(diagnosePool(noDessert, 4).missing).toContain("dessert");
  });

  it("пустой пул не роняет диагностику", () => {
    const d = diagnosePool([], 4);
    expect(d.ok).toBe(false);
    expect(d.missing.length).toBeGreaterThan(0);
  });
});
