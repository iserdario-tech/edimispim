import type { Day, Grocery, GroceryItem, Ingredient, Meal } from "./types";
import { costOf } from "./prices";

// свежие категории — скоропорт; консервы/заморозка/сушёное хранятся долго
const FRESH = new Set(["мясо/рыба", "молочное", "яйца", "овощи/фрукты"]);

function isPerishable(ing: Ingredient): boolean {
  const n = String(ing.name).toLowerCase();
  if (/консерв|заморож|сушён|сухой|вялен/.test(n)) return false;
  return FRESH.has(ing.category);
}

function aggregate(meals: Meal[]): GroceryItem[] {
  const map = new Map<string, GroceryItem>();
  for (const m of meals) {
    for (const ing of m.recipe.ingredients ?? []) {
      // канонизация имени → без дублей «яйцо/яйца»
      const key = (ing.name + "|" + ing.unit).toLowerCase().trim();
      const prev = map.get(key) ?? {
        name: ing.name,
        unit: ing.unit,
        qty: 0,
        category: ing.category,
        perishable: isPerishable(ing),
      };
      prev.qty += ing.qty * (m.servings ?? 1);
      map.set(key, prev);
    }
  }
  return [...map.values()]
    .map(i => ({ ...i, qty: +i.qty.toFixed(1) }))
    .sort((a, b) => String(a.category).localeCompare(String(b.category)));
}

/**
 * Стоимость по РЕАЛЬНЫМ ценам магазина, а не по полю `cost_rub` из рецепта:
 * то было «прикидкой на глаз», никогда не сверявшейся с прилавком.
 * Продукты без известной цены просто не считаются — лучше занизить, чем соврать.
 */
const costRub = (meals: Meal[]): number => {
  let sum = 0;
  for (const m of meals) {
    for (const ing of m.recipe.ingredients ?? []) {
      sum += costOf(ing.name, ing.qty * (m.servings ?? 1), ing.unit) ?? 0;
    }
  }
  return Math.round(sum);
};

export function buildGroceryList(week: Pick<Day, "meals">[]): Grocery {
  const items = aggregate(week.flatMap(d => d.meals));
  const byDay = week.map((d, i) => {
    const dayItems = aggregate(d.meals);
    return {
      day: i + 1,
      items: dayItems,
      estCostRub: costRub(d.meals),
      hasPerishable: dayItems.some(x => x.perishable),
    };
  });
  const estCostRub = byDay.reduce((s, d) => s + d.estCostRub, 0);
  return { items, estCostRub, byDay };
}
