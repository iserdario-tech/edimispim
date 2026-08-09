import type { Day, Grocery, GroceryItem, Ingredient, Meal } from "./types";
import { costOf } from "./prices";
import { gramsOf, mlOf, isLiquid } from "./nutrients";

// свежие категории — скоропорт; консервы/заморозка/сушёное хранятся долго
const FRESH = new Set(["мясо/рыба", "молочное", "яйца", "овощи/фрукты"]);

function isPerishable(ing: Ingredient): boolean {
  const n = String(ing.name).toLowerCase();
  if (/консерв|заморож|сушён|сухой|вялен/.test(n)) return false;
  return FRESH.has(ing.category);
}

/**
 * Единицы одного продукта, приведённые к одной.
 *
 * Ключом строки покупки было «имя + единица», и продукт, записанный в разных рецептах
 * по-разному, попадал в список ДВАЖДЫ: «молоко 150 г» и следом «молоко 21 мл». Так вышло
 * у семи продуктов — молоко, кефир, соевый соус, кокосовое молоко, банан, лаваш, яичные
 * белки. Человек у полки видел две строки одного и того же и не понимал, сколько брать.
 *
 * Разнобой лечится в граммах: миллилитры для наших жидкостей равны граммам, а штуки
 * переводит `gramsOf` по среднему весу. Продукты, записанные единообразно, не трогаем —
 * «2 шт яиц» человеку понятнее, чем «120 г».
 */
function unitsByName(meals: Meal[]): Map<string, Set<string>> {
  const units = new Map<string, Set<string>>();
  for (const m of meals) {
    for (const ing of m.recipe.ingredients ?? []) {
      const name = ing.name.toLowerCase().trim();
      const set = units.get(name) ?? new Set<string>();
      set.add(ing.unit);
      units.set(name, set);
    }
  }
  return units;
}

function aggregate(meals: Meal[]): GroceryItem[] {
  const map = new Map<string, GroceryItem>();
  const mixed = unitsByName(meals);
  for (const m of meals) {
    for (const ing0 of m.recipe.ingredients ?? []) {
      const many = (mixed.get(ing0.name.toLowerCase().trim())?.size ?? 1) > 1;
      // жидкость покупают объёмом: молоко в литрах, масло в бутылках — на вес его никто не берёт
      const ing = isLiquid(ing0.name)
        ? { ...ing0, qty: +mlOf(ing0.name, ing0.qty, ing0.unit).toFixed(1), unit: "мл" }
        : many
          ? { ...ing0, qty: gramsOf(ing0.name, ing0.qty, ing0.unit), unit: "г" }
          : ing0;
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
