import { describe, it, expect } from "vitest";
import { rebalance, toggleMark, setOwnSize, eatenTotals } from "../src/food/eaten";
import type { Day, Slot } from "../src/food/types";

const meal = (slot: Slot, kcal: number, timeMin: number) => ({
  recipe: { id: slot, name: slot, meal_type: slot as never, kcal, protein_g: 20, fiber_g: 3 },
  servings: 1, timeMin, slot,
});
const day: Day = {
  meals: [meal("breakfast", 400, 480), meal("lunch", 600, 800), meal("dessert", 150, 1000), meal("dinner", 500, 1200)],
  totals: { kcal: 1650, protein: 80, fiber: 12 },
};
const servings = (d: Day) => Object.fromEntries(d.meals.map(m => [m.slot, m.servings]));

describe("день подстраивается под съеденное", () => {
  it("без отметок ничего не меняет", () => {
    const r = rebalance(day, undefined);
    expect(servings(r.day)).toEqual({ breakfast: 1, lunch: 1, dessert: 1, dinner: 1 });
    expect(r.noteRU).toBeUndefined();
  });
  it("плотный обед — остаток дня меньше, но не меньше 0.7 порции", () => {
    let e = toggleMark(undefined, "breakfast", "ate", 4);
    e = toggleMark(e, "lunch", "own", 4);
    e = setOwnSize(e, "lunch", "big");          // 900 вместо 600
    const r = rebalance(day, e);
    expect(r.day.meals.find(m => m.slot === "dinner")!.servings).toBe(0.7);
    expect(r.day.meals.find(m => m.slot === "dessert")!.servings).toBe(0.7);
    expect(r.day.meals.find(m => m.slot === "lunch")!.servings).toBe(1);   // отмеченное не трогаем
    expect(r.noteRU).toMatch(/меньше/);
  });
  it("лёгкий завтрак — остаток дня чуть больше", () => {
    let e = toggleMark(undefined, "breakfast", "own", 4);
    e = setOwnSize(e, "breakfast", "light");    // 240 вместо 400
    const r = rebalance(day, e);
    expect(r.day.meals.find(m => m.slot === "dinner")!.servings).toBe(1.1);
    expect(r.noteRU).toMatch(/больше/);
  });
  it("съел ровно по плану — порции прежние", () => {
    const r = rebalance(day, toggleMark(undefined, "breakfast", "ate", 4));
    expect(servings(r.day)).toEqual({ breakfast: 1, lunch: 1, dessert: 1, dinner: 1 });
    expect(r.noteRU).toBeUndefined();
  });
  it("не мутирует исходный день", () => {
    let e = toggleMark(undefined, "lunch", "own", 4);
    e = setOwnSize(e, "lunch", "big");
    rebalance(day, e);
    expect(day.meals.find(m => m.slot === "dinner")!.servings).toBe(1);
  });
});

describe("съеденная уменьшенная порция", () => {
  it("«съел» после пересчёта засчитывает уменьшенную порцию, а не плановую", () => {
    let e = toggleMark(undefined, "breakfast", "ate", 4);
    e = toggleMark(e, "lunch", "own", 4);
    e = setOwnSize(e, "lunch", "big");
    const reduced = rebalance(day, e).day.meals.find(m => m.slot === "dinner")!.servings;   // 0.7
    e = toggleMark(e, "dinner", "ate", 4, undefined, reduced);
    expect(eatenTotals(day, e).kcal).toBe(400 + 900 + 350);
  });
});
