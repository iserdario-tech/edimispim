import { describe, it, expect } from "vitest";
import { PRICES, priceFor, costOf, coverage, PRICES_SOURCE, PRICES_DATE, UNKNOWN_PRICE } from "../src/food/prices";
import recipesJson from "../src/food/data/recipes.json";
import type { Recipe } from "../src/food/types";

const recipes = recipesJson as Recipe[];
const allNames = [...new Set(recipes.flatMap(r => (r.ingredients ?? []).map(i => i.name)))];

describe("цены собраны из магазина, а не выдуманы", () => {
  it("указаны источник и дата снятия — цены протухают", () => {
    expect(PRICES_SOURCE).toMatch(/ВкусВилл/);
    expect(PRICES_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("покрыто большинство продуктов из рецептов", () => {
    const { known, total } = coverage(allNames);
    expect(known / total).toBeGreaterThan(0.8);
  });

  it("по каждому продукту решение принято: либо цена, либо честное «неизвестно»", () => {
    // «покрыто большинство» пропускало забытые продукты молча: «банан замороженный»
    // не имел ни цены, ни пометки, и неделя тихо выходила дешевле, чем есть
    const undecided = allNames
      .map(n => n.toLowerCase().trim())
      .filter(n => PRICES[n] === undefined && !UNKNOWN_PRICE.has(n));
    expect(undecided, `без решения по цене: ${undecided.join(", ")}`).toHaveLength(0);
  });

  it("цены правдоподобны: никакой картошки по 200 ₽ за 100 г", () => {
    for (const [name, per100] of Object.entries(PRICES)) {
      expect(per100, `${name}`).toBeGreaterThan(0);
      expect(per100, `${name} — подозрительно дорого`).toBeLessThan(500);
    }
  });

  it("овощи дешевле мяса — базовая проверка здравого смысла", () => {
    expect(priceFor("картофель")!).toBeLessThan(priceFor("куриное филе")!);
    expect(priceFor("морковь")!).toBeLessThan(priceFor("филе лосося")!);
    expect(priceFor("лук")!).toBeLessThan(priceFor("говядина нежирная")!);
  });

  it("где выдача врёт — цены нет вовсе, а не выдуманной", () => {
    // по «банан» после отсева переработки остаются только дорогие фасовки
    expect(UNKNOWN_PRICE.has("банан")).toBe(true);
    expect(priceFor("банан")).toBeUndefined();
    expect(priceFor("творог 5%")).toBe(60);
  });
});

describe("расчёт стоимости", () => {
  it("считает по весу", () => {
    expect(costOf("рис", 100, "г")).toBe(30);       // 30.2 ₽/100 г
    expect(costOf("рис", 50, "г")).toBe(15);
  });

  it("штучный товар считается по среднему весу штуки, а не выпадает из суммы", () => {
    // яйца стоят почти в каждом втором рецепте, и раньше они молча не попадали в стоимость
    expect(costOf("яйца", 2, "шт")).toBe(Math.round((22.5 * 120) / 100));   // 2 × 60 г
  });

  it("продукт без цены остаётся без цены и в штуках", () => {
    expect(costOf("банан", 1, "шт")).toBeNull();
  });

  it("неизвестный продукт даёт null, а не ноль", () => {
    expect(costOf("неведомая ягода", 100, "г")).toBeNull();
  });

  it("регистр и пробелы не мешают", () => {
    expect(priceFor("  Творог 5%  ")).toEqual(priceFor("творог 5%"));
  });
});
