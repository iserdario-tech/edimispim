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
    // дорогие за 100 г, но в рецепт идут граммами — это правда, а не ошибка снятия
    const PRICEY = new Set(["желатин", "кедровые орехи", "лавровый лист"]);   // лавровый лист: 10 г за 55 ₽, в блюдо идёт один
    for (const [name, per100] of Object.entries(PRICES)) {
      expect(per100, `${name}`).toBeGreaterThan(0);
      if (!PRICEY.has(name)) expect(per100, `${name} — подозрительно дорого`).toBeLessThan(500);
    }
  });

  it("овощи дешевле мяса — базовая проверка здравого смысла", () => {
    expect(priceFor("картофель")!).toBeLessThan(priceFor("куриное филе")!);
    expect(priceFor("морковь")!).toBeLessThan(priceFor("филе лосося")!);
    expect(priceFor("лук")!).toBeLessThan(priceFor("говядина нежирная")!);
  });

  it("где выдача врёт — цены нет вовсе, а не выдуманной", () => {
    // по «сиропу топинамбура» магазин отдаёт сладости на нём, а не сам сироп
    expect(UNKNOWN_PRICE.has("сироп топинамбура")).toBe(true);
    expect(priceFor("сироп топинамбура")).toBeUndefined();
    // а банан снят честно: «Бананы» 168 ₽/кг (MCP ВкусВилла, 2026-10-07)
    expect(priceFor("банан")).toBe(16.8);
    expect(priceFor("творог 5%")).toBe(PRICES["творог 5%"]);
  });
});

describe("расчёт стоимости", () => {
  it("считает по весу", () => {
    expect(costOf("рис", 100, "г")).toBe(Math.round(PRICES["рис"]!));
    expect(costOf("рис", 50, "г")).toBe(Math.round(PRICES["рис"]! / 2));
  });

  it("штучный товар считается по среднему весу штуки, а не выпадает из суммы", () => {
    // яйца стоят почти в каждом втором рецепте, и раньше они молча не попадали в стоимость
    expect(costOf("яйца", 2, "шт")).toBe(Math.round((PRICES["яйца"]! * 120) / 100));   // 2 × 60 г
  });

  it("продукт без цены остаётся без цены и в штуках", () => {
    expect(costOf("сироп топинамбура", 1, "шт")).toBeNull();
  });

  it("неизвестный продукт даёт null, а не ноль", () => {
    expect(costOf("неведомая ягода", 100, "г")).toBeNull();
  });

  it("регистр и пробелы не мешают", () => {
    expect(priceFor("  Творог 5%  ")).toEqual(priceFor("творог 5%"));
  });
});
