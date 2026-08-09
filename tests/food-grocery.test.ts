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

/**
 * Один продукт — одна строка в списке.
 *
 * Ключом строки было «имя + единица», и продукт, записанный в разных рецептах по-разному,
 * попадал в список дважды: «молоко 150 г» и следом «молоко 21 мл». Так вело себя семь
 * продуктов набора. У полки это выглядело как две разные покупки.
 */
describe("смешанные единицы", () => {
  const meal = (name: string, qty: number, unit: string) => ({
    recipe: { id: name + unit, name, meal_type: "lunch" as const, kcal: 100, protein_g: 5, fiber_g: 1,
      ingredients: [{ name, qty, unit, category: "молочное" }] },
    servings: 1, timeMin: 0, slot: "lunch" as const,
  });

  it("миллилитры и граммы одного продукта сливаются в одну строку", () => {
    const g = buildGroceryList([{ meals: [meal("молоко", 150, "г"), meal("молоко", 200, "мл")] }]);
    const milk = g.items.filter(i => i.name === "молоко");
    expect(milk).toHaveLength(1);
    expect(milk[0]!.qty).toBe(350);
  });

  it("штуки переводятся в граммы, когда тот же продукт где-то записан весом", () => {
    const g = buildGroceryList([{ meals: [meal("банан", 100, "г"), meal("банан", 1, "шт")] }]);
    const banana = g.items.filter(i => i.name === "банан");
    expect(banana).toHaveLength(1);
    expect(banana[0]!.unit).toBe("г");
    expect(banana[0]!.qty).toBeGreaterThan(100);
  });

  it("продукт с одной единицей остаётся в ней: «2 шт» понятнее, чем «120 г»", () => {
    const g = buildGroceryList([{ meals: [meal("яйца", 2, "шт")] }]);
    expect(g.items.find(i => i.name === "яйца")!.unit).toBe("шт");
  });
});
