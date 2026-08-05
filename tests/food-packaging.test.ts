import { describe, it, expect } from "vitest";
import { planPurchase, pantryAfter, packOf, isStaple, leftoverShare } from "../src/food/packaging";

/**
 * Сценарий из жизни: на завтрак нужно 100 г творога, а пачка — 200 г.
 * Приложение должно просить купить пачку, помнить про остаток и не покупать творог заново.
 */
describe("фасовки", () => {
  it("округляет вверх до целой упаковки: полпачки в магазине не продают", () => {
    const [line] = planPurchase([{ name: "творог 5%", unit: "г", qty: 100 }]);
    expect(line!.packSize).toBe(200);
    expect(line!.packs).toBe(1);
    expect(line!.buyAmount).toBe(200);
    expect(line!.leftover).toBe(100);
  });

  it("несколько упаковок, когда одной мало", () => {
    const [line] = planPurchase([{ name: "творог 5%", unit: "г", qty: 450 }]);
    expect(line!.packs).toBe(3);           // 450 → три пачки по 200
    expect(line!.buyAmount).toBe(600);
    expect(line!.leftover).toBe(150);
  });

  it("ровное количество не даёт остатка", () => {
    const [line] = planPurchase([{ name: "творог 5%", unit: "г", qty: 400 }]);
    expect(line!.packs).toBe(2);
    expect(line!.leftover).toBe(0);
  });

  it("весовой товар берут сколько нужно, без округления", () => {
    const [line] = planPurchase([{ name: "банан", unit: "г", qty: 160 }]);
    expect(line!.loose).toBe(true);
    expect(line!.buyAmount).toBe(160);
    expect(line!.leftover).toBe(0);
  });

  it("незнакомый продукт считается весовым, а не выдуманной фасовкой", () => {
    expect(packOf("что-то невиданное").loose).toBe(true);
    const [line] = planPurchase([{ name: "что-то невиданное", unit: "г", qty: 77 }]);
    expect(line!.buyAmount).toBe(77);
  });

  it("специи не покупаются под рецепт — они просто есть на кухне", () => {
    expect(isStaple("соль")).toBe(true);
    expect(isStaple("зира")).toBe(true);
    expect(isStaple("куриное филе")).toBe(false);
    const [line] = planPurchase([{ name: "соль", unit: "г", qty: 5 }]);
    expect(line!.packs).toBe(0);
  });

  it("яйца считаются штуками, а не граммами", () => {
    const [line] = planPurchase([{ name: "яйца", unit: "шт", qty: 7 }]);
    expect(line!.packSize).toBe(10);
    expect(line!.packs).toBe(1);
    expect(line!.leftover).toBe(3);
  });
});

describe("кладовка", () => {
  it("то, что есть дома, вычитается из закупки", () => {
    const [line] = planPurchase(
      [{ name: "творог 5%", unit: "г", qty: 150 }],
      { "творог 5%|г": 100 },
    );
    expect(line!.haveAtHome).toBe(100);
    expect(line!.toBuy).toBe(50);
    expect(line!.packs).toBe(1);          // всё равно пачка 200
    expect(line!.leftover).toBe(150);     // 100 дома + 200 куплено − 150 съедено
  });

  it("если дома хватает — не покупаем вовсе", () => {
    const [line] = planPurchase(
      [{ name: "творог 5%", unit: "г", qty: 100 }],
      { "творог 5%|г": 200 },
    );
    expect(line!.toBuy).toBe(0);
    expect(line!.packs).toBe(0);
    expect(line!.buyAmount).toBe(0);
    expect(line!.leftover).toBe(100);     // дома было 200, ушло 100
  });

  it("дома больше, чем нужно — лишнее остаётся лежать, а не исчезает", () => {
    const [line] = planPurchase(
      [{ name: "рис", unit: "г", qty: 100 }],
      { "рис|г": 5000 },
    );
    expect(line!.haveAtHome).toBe(5000);   // столько лежит
    expect(line!.usedFromHome).toBe(100);  // столько уйдёт в готовку
    expect(line!.toBuy).toBe(0);
    expect(line!.leftover).toBe(4900);     // остальное продолжает лежать
  });

  it("остатки переезжают в следующую закупку", () => {
    const week1 = planPurchase([{ name: "творог 5%", unit: "г", qty: 100 }]);
    const pantry = pantryAfter(week1);
    expect(pantry["творог 5%|г"]).toBe(100);

    const week2 = planPurchase([{ name: "творог 5%", unit: "г", qty: 100 }], pantry);
    expect(week2[0]!.packs).toBe(0);      // вторую пачку покупать не надо
    expect(week2[0]!.haveAtHome).toBe(100);
  });

  it("нулевые остатки не засоряют кладовку", () => {
    const lines = planPurchase([{ name: "творог 5%", unit: "г", qty: 400 }]);
    expect(pantryAfter(lines)).toEqual({});
  });

  it("регистр и пробелы в названии не мешают найти остаток", () => {
    const [line] = planPurchase(
      [{ name: "  Творог 5%  ", unit: "г", qty: 150 }],
      { "творог 5%|г": 100 },
    );
    expect(line!.haveAtHome).toBe(100);
  });
});

describe("цена фасовок", () => {
  it("показывает, какая доля закупки уходит в остаток", () => {
    const lines = planPurchase([
      { name: "творог 5%", unit: "г", qty: 100 },     // куплено 200, остаток 100
      { name: "банан", unit: "г", qty: 100 },         // весовой, остатка нет
    ]);
    expect(leftoverShare(lines)).toBeCloseTo(100 / 300, 2);
  });

  it("пустой список не делит на ноль", () => {
    expect(leftoverShare([])).toBe(0);
  });
});
