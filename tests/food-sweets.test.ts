import { describe, it, expect } from "vitest";
import recipes from "../src/food/data/recipes.json";
import { filterRecipes, isNoCook } from "../src/food/planner";
import type { Recipe } from "../src/food/types";

/** «Готовить самому десерты — это заеб тот ещё»: сладкое можно покупать или собирать без плиты. */
const all = recipes as Recipe[];
const desserts = (sweets?: "buy" | "nocook" | "cook") =>
  filterRecipes(all, { cookware: ["stove", "oven", "microwave", "blender"], ...(sweets ? { sweets } : {}) }).filter(r => r.meal_type === "dessert");

describe("сладкое", () => {
  it("по умолчанию — домашние десерты, как было: покупного нет", () => {
    expect(desserts().some(r => r.tags?.includes("ready"))).toBe(false);
    expect(desserts("cook").map(r => r.id)).toEqual(desserts().map(r => r.id));
  });
  it("«покупное» — только готовое из магазина, и его хватает на неделю без повторов", () => {
    const d = desserts("buy");
    expect(d.every(r => r.tags?.includes("ready"))).toBe(true);
    expect(d.length).toBeGreaterThanOrEqual(7);
  });
  it("«без готовки» — покупное и собранное за 10 минут без плиты и духовки", () => {
    const d = desserts("nocook");
    expect(d.every(isNoCook)).toBe(true);
    expect(d.some(r => !r.tags?.includes("ready"))).toBe(true);
    expect(d.some(r => (r.cookware ?? []).includes("oven"))).toBe(false);
  });
});
