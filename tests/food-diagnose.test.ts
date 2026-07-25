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

  it("аллергия на молоко и яйца оставляет один завтрак — предупреждаем об однообразии", () => {
    const pool = filterRecipes(recipes, { allergens: ["milk", "egg"], cookware: ALL_COOKWARE });
    const d = diagnosePool(pool, 4);
    expect(d.counts.breakfast).toBeLessThan(3);
    expect(d.ok).toBe(true);                       // день ещё собирается
    expect(d.monotonous).toContain("breakfast");
    expect(d.messageRU).toMatch(/повторя/);
  });

  it("все аллергены сразу — завтраков и десертов нет, говорим прямо", () => {
    const pool = filterRecipes(recipes, {
      allergens: ["milk", "egg", "fish", "gluten", "nuts", "soy"], cookware: ALL_COOKWARE,
    });
    const d = diagnosePool(pool, 4);
    expect(d.ok).toBe(false);
    expect(d.missing).toContain("breakfast");
    expect(d.messageRU).toMatch(/не осталось/);
    expect(d.messageRU).toMatch(/аллерги/);        // подсказываем, что именно ослабить
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
