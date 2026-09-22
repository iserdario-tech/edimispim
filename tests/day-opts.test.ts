import { describe, it, expect } from "vitest";
import { cookLimitFor, NO_COOK_MIN } from "../src/ui/dayOpts";
import { scaleGrocery } from "../src/food/grocery";
import type { Grocery } from "../src/food/types";

const food = { cookMin: { weekday: 30 } } as never;

describe("лимит готовки на дату", () => {
  it("будний день — будничный лимит, выходной — без ограничений", () => {
    expect(cookLimitFor(food, "2026-09-23", false)).toBe(30);        // среда
    expect(cookLimitFor(food, "2026-09-26", false)).toBeUndefined(); // суббота
  });
  it("«сегодня не готовлю» сильнее любой настройки", () => {
    expect(cookLimitFor(food, "2026-09-26", true)).toBe(NO_COOK_MIN);
  });
  it("без настроек — без ограничений", () => {
    expect(cookLimitFor({} as never, "2026-09-23", false)).toBeUndefined();
  });
});

describe("покупки на несколько человек", () => {
  const g: Grocery = {
    items: [{ name: "гречка", unit: "г", qty: 150, category: "крупы", perishable: false }],
    estCostRub: 100,
    byDay: [{ day: 1, items: [{ name: "гречка", unit: "г", qty: 150, category: "крупы", perishable: false }], estCostRub: 100, hasPerishable: false }],
  };
  it("умножает количество и цену", () => {
    const x = scaleGrocery(g, 2);
    expect(x.items[0]!.qty).toBe(300);
    expect(x.estCostRub).toBe(200);
    expect(x.byDay[0]!.items[0]!.qty).toBe(300);
  });
  it("на одного — тот же объект", () => {
    expect(scaleGrocery(g, 1)).toBe(g);
  });
});
