import { describe, it, expect } from "vitest";
import { amountRU } from "../src/ui/Grocery";
import { gramsOf, mlOf, isLiquid } from "../src/food/nutrients";

/**
 * У полки количество называют не так, как в рецепте: молоко берут литрами, а не
 * граммами. Плотность при этом настоящая — миллилитры не равны граммам ни для масла
 * (0.92), ни для соевого соуса (1.2), и раньше эта разница уходила прямо в калории.
 */
describe("как называются количества", () => {
  it("литры вместо тысяч миллилитров", () => {
    expect(amountRU(1000, "мл")).toBe("1 л");
    expect(amountRU(1500, "мл")).toBe("1.5 л");
    expect(amountRU(900, "мл")).toBe("900 мл");
  });

  it("килограммы вместо тысяч граммов", () => {
    expect(amountRU(1200, "г")).toBe("1.2 кг");
    expect(amountRU(800, "г")).toBe("800 г");
  });

  it("штуки не трогаем", () => {
    expect(amountRU(10, "шт")).toBe("10 шт");
  });
});

describe("плотность жидкостей", () => {
  it("миллилитры больше не равны граммам", () => {
    expect(gramsOf("соевый соус", 100, "мл")).toBe(120);   // солёный и плотный
    expect(gramsOf("масло оливковое", 100, "мл")).toBe(92); // легче воды
    expect(gramsOf("молоко", 100, "мл")).toBeCloseTo(103, 0);
  });

  it("вес переводится в объём обратно", () => {
    expect(mlOf("масло оливковое", 92, "г")).toBeCloseTo(100, 0);
    expect(mlOf("молоко", 103, "г")).toBeCloseTo(100, 0);
  });

  it("жидкость — то, что продают объёмом, а не всё текучее", () => {
    expect(isLiquid("молоко")).toBe(true);
    expect(isLiquid("масло растительное")).toBe(true);
    expect(isLiquid("мёд")).toBe(false);        // банка, и меряют её граммами
    expect(isLiquid("сметана 15%")).toBe(false);
  });

  it("продукт без плотности считается как есть", () => {
    expect(gramsOf("гречка", 100, "г")).toBe(100);
  });
});
