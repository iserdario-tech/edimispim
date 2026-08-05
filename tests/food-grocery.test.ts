import { describe, it, expect } from "vitest";
import { buildGroceryList } from "../src/food/grocery";
import type { Meal } from "../src/food/types";

const meal = (costRub: number, ing: { name: string; qty: number; unit: string; category: string }, servings: number): Meal => ({
  recipe: { id: "x", name: "x", meal_type: "lunch", kcal: 1, protein_g: 1, fiber_g: 1, cost_rub: costRub, ingredients: [ing] },
  servings,
  timeMin: 780,
  slot: "lunch",
});

const week = [
  { meals: [
    meal(90, { name: "куриное филе", qty: 100, unit: "г", category: "мясо/рыба" }, 1.5),
    meal(20, { name: "рис", qty: 50, unit: "г", category: "крупы" }, 1),
  ] },
  { meals: [
    meal(90, { name: "куриное филе", qty: 100, unit: "г", category: "мясо/рыба" }, 1),
    meal(60, { name: "фасоль консервированная", qty: 150, unit: "г", category: "бобовые" }, 1),
  ] },
];

describe("buildGroceryList", () => {
  it("агрегирует одинаковый ингредиент по неделе с учётом порций", () => {
    const g = buildGroceryList(week);
    expect(g.items.find(i => i.name === "куриное филе")!.qty).toBe(250);  // 100*1.5 + 100*1
  });

  it("список по дням + бюджет по РЕАЛЬНЫМ ценам продуктов", () => {
    const g = buildGroceryList(week);
    expect(g.byDay).toHaveLength(2);
    // считается по ингредиентам и их ценам за 100 г, а не по выдуманному cost_rub рецепта:
    // куриное филе 146.4 ₽/100 г × 150 г + рис 30.2 ₽/100 г × 50 г
    expect(g.byDay[0].estCostRub).toBe(Math.round(146.4 * 1.5) + Math.round(30.2 * 0.5));
    expect(g.estCostRub).toBe(g.byDay[0].estCostRub + g.byDay[1].estCostRub);
  });

  it("скоропорт помечается, консервы — нет", () => {
    const g = buildGroceryList(week);
    expect(g.items.find(i => i.name === "куриное филе")!.perishable).toBe(true);
    expect(g.items.find(i => i.name === "фасоль консервированная")!.perishable).toBe(false);
  });
});
