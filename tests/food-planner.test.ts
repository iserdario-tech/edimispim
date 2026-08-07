import { describe, it, expect } from "vitest";
import {
  filterRecipes, generateDay, generateWeek, swapDish, mealTimes, DINNER_BEFORE_BED_MIN, expectedBedMin,
} from "../src/food/planner";
import { parseHM } from "../src/time";
import type { MealCount, Recipe, Targets } from "../src/food/types";

const R: Recipe[] = [
  { id: "b", name: "Омлет", meal_type: "breakfast", kcal: 300, protein_g: 22, fiber_g: 4, cost_rub: 80, cookware: ["stove"], allergens: ["egg"], cuisine: "universal", ingredients: [] },
  { id: "l", name: "Курица с гречкой", meal_type: "lunch", kcal: 500, protein_g: 40, fiber_g: 9, cost_rub: 120, cookware: ["stove"], allergens: [], cuisine: "universal", ingredients: [] },
  { id: "d", name: "Рыба", meal_type: "dinner", kcal: 400, protein_g: 35, fiber_g: 8, cost_rub: 160, cookware: ["oven"], allergens: ["fish"], cuisine: "universal", ingredients: [] },
];
const targets: Targets = { bmr: 1400, tdee: 2250, kcalTarget: 1700, proteinGTarget: 120, fiberGTarget: 30, tempoKgPerWeek: 0.5 };
const rhythm = { wakeMin: parseHM("07:00"), bedMin: parseHM("23:00") };

describe("filterRecipes", () => {
  it("исключает аллергены и недоступную посуду", () => {
    const f = filterRecipes(R, { allergens: ["egg"], cookware: ["stove"] });
    expect(f.some(r => r.id === "b")).toBe(false);
    expect(f.some(r => r.id === "d")).toBe(false);   // духовки нет
  });

  it("бюджет small отсекает невыгодные блюда по реальным ценам", () => {
    // цена берётся из состава и справочника цен, а не из поля cost_rub: оно было
    // «прикидкой на глаз», и у новых рецептов его нет вовсе — раньше они проходили любой бюджет
    const mk = (id: string, name: string, ing: string, qty: number, protein: number): Recipe => ({
      id, name, meal_type: "dinner", kcal: 400, protein_g: protein, fiber_g: 5,
      cookware: ["stove"], allergens: [], cuisine: "universal",
      ingredients: [{ name: ing, qty, unit: "г", category: "мясо/рыба" }],
    });
    const RR: Recipe[] = [
      mk("d1", "Курица", "куриное филе", 150, 35),
      mk("d2", "Гречка", "гречка", 100, 12),
      mk("d3", "Треска", "филе трески", 150, 27),
      mk("d4", "Лосось", "филе лосося", 200, 40),
      mk("d5", "Пармезан", "пармезан", 120, 43),
    ];
    const f = filterRecipes(RR, { budget: "small", cookware: ["stove"] }).map(r => r.id);
    expect(f).toContain("d2");                       // гречка — 22 ₽ за порцию
    expect(f).not.toContain("d5");                   // пармезан — 292 ₽ за те же граммы белка
    expect(f.length).toBeLessThan(RR.length);
  });

  it("бюджет не оставляет приём без выбора", () => {
    const mk = (id: string): Recipe => ({
      id, name: id, meal_type: "lunch", kcal: 500, protein_g: 30, fiber_g: 5,
      cookware: ["stove"], allergens: [], cuisine: "universal",
      ingredients: [{ name: "филе лосося", qty: 200, unit: "г", category: "мясо/рыба" }],
    });
    // все блюда дорогие — но выкинуть их все нельзя, иначе меню не собрать
    const f = filterRecipes([mk("a"), mk("b"), mk("c")], { budget: "small", cookware: ["stove"] });
    expect(f.length).toBeGreaterThanOrEqual(3);
  });

  it("нелюбимое ловит русские словоформы (капуста → капустой)", () => {
    const RR: Recipe[] = [{ id: "k", name: "Индейка с тушёной капустой", meal_type: "dinner", kcal: 380, protein_g: 34, fiber_g: 9, cost_rub: 130, cookware: ["stove"], allergens: [], cuisine: "universal", ingredients: [] }];
    expect(filterRecipes(RR, { dislikes: ["капуста"], cookware: ["stove"] })).toHaveLength(0);
  });

  it("фильтр кухни оставляет выбранную + universal", () => {
    const mk = (id: string, cuisine: Recipe["cuisine"]): Recipe =>
      ({ id, name: id, meal_type: "breakfast", kcal: 300, protein_g: 22, fiber_g: 4, cost_rub: 80, cookware: ["stove"], allergens: [], cuisine, ingredients: [] });
    const f = filterRecipes([mk("bu", "universal"), mk("ba", "asian"), mk("bm", "mediterranean")], { cuisines: ["asian"], cookware: ["stove"] });
    expect(f.map(r => r.id).sort()).toEqual(["ba", "bu"]);
  });
});

// Регресс: отбой считали как «подъём + длительность сна», из-за чего на экране недели
// ужин вставал в 12:00. Отсчитывать надо НАЗАД от подъёма.
describe("expectedBedMin", () => {
  it("подъём 07:00 при цели 7:45 → лечь в 23:15 накануне", () => {
    expect(expectedBedMin(parseHM("07:00"), 465)).toBe(parseHM("23:15"));
  });

  it("отбой всегда раньше подъёма следующего дня и позже полудня", () => {
    for (const wake of ["05:00", "07:00", "09:30", "11:00"]) {
      const bed = expectedBedMin(parseHM(wake), 465);
      expect(bed).toBeGreaterThan(parseHM("12:00"));
      expect(bed).toBeLessThan(parseHM("07:00") + 1440);
    }
  });

  it("ужин от такого отбоя попадает в вечер, а не в середину дня", () => {
    const bed = expectedBedMin(parseHM("07:00"), 465);
    const dinner = mealTimes({ wakeMin: parseHM("07:00"), bedMin: bed }, 4).dinner!;
    expect(dinner).toBeGreaterThanOrEqual(parseHM("18:00"));
    expect(dinner).toBeLessThanOrEqual(parseHM("22:00"));
  });
});

describe("mealTimes — времена от ритма суток, а не из справочника", () => {
  it("ужин ставится за 3 часа до отбоя", () => {
    const t = mealTimes(rhythm, 4);
    expect(t.dinner).toBe(parseHM("20:00"));
    expect(rhythm.bedMin - t.dinner!).toBe(DINNER_BEFORE_BED_MIN);
  });

  it("поздний отбой двигает ужин вместе с собой", () => {
    // отбой в 01:00 следующих суток = 1500 мин → ужин в 22:00 текущих
    const late = mealTimes({ wakeMin: parseHM("09:00"), bedMin: parseHM("01:00") + 1440 }, 4);
    expect(late.dinner).toBe(parseHM("22:00"));
  });

  it("завтрак — через полчаса после подъёма, обед между завтраком и ужином", () => {
    const t = mealTimes(rhythm, 4);
    expect(t.breakfast).toBe(parseHM("07:30"));
    expect(t.lunch).toBe((t.breakfast! + t.dinner!) / 2);
  });

  it("в схеме из 2 приёмов завтрака нет, а первый приём позже подъёма", () => {
    const t = mealTimes(rhythm, 2);
    expect(t.breakfast).toBeUndefined();
    expect(t.lunch!).toBeGreaterThan(rhythm.wakeMin + 30);
  });

  it("после плохой ночи сладкое переносится на вечер, после ужина", () => {
    const normal = mealTimes(rhythm, 4);
    const rough = mealTimes(rhythm, 4, true);
    expect(normal.dessert!).toBeLessThan(normal.dinner!);
    expect(rough.dessert!).toBeGreaterThan(rough.dinner!);
    expect(rough.dessert!).toBeLessThan(rhythm.bedMin);
  });

  it("все приёмы идут по возрастанию и укладываются между подъёмом и отбоем", () => {
    for (const count of [2, 3, 4, 5] as MealCount[]) {
      const times = Object.values(mealTimes(rhythm, count)).sort((a, b) => a - b);
      expect(times[0]).toBeGreaterThan(rhythm.wakeMin);
      expect(times[times.length - 1]).toBeLessThanOrEqual(rhythm.bedMin);
      expect(new Set(times).size).toBe(times.length);   // не совпадают
    }
  });
});

describe("generateDay / generateWeek", () => {
  const pool: Recipe[] = [
    { id: "b", name: "b", meal_type: "breakfast", kcal: 300, protein_g: 20, fiber_g: 5, ingredients: [] },
    { id: "l", name: "l", meal_type: "lunch", kcal: 500, protein_g: 40, fiber_g: 9, ingredients: [] },
    { id: "d", name: "d", meal_type: "dinner", kcal: 400, protein_g: 35, fiber_g: 8, ingredients: [] },
    { id: "s", name: "s", meal_type: "dessert", kcal: 200, protein_g: 20, fiber_g: 3, ingredients: [] },
  ];

  it("неделя из 7 дней, ужин привязан к отбою, калораж в пределах ±15%", () => {
    const week = generateWeek(targets, R, { rhythm, constraints: { cookware: ["stove", "oven"] } });
    expect(week).toHaveLength(7);
    for (const day of week) {
      expect(day.meals.some(m => m.slot === "dinner" && m.timeMin === parseHM("20:00"))).toBe(true);
      expect(Math.abs(day.totals.kcal - targets.kcalTarget)).toBeLessThanOrEqual(targets.kcalTarget * 0.15);
    }
  });

  it("десерт вписан в норму — день остаётся у цели", () => {
    const day = generateDay(targets, pool, { rhythm });
    expect(day.meals.some(m => m.slot === "dessert")).toBe(true);
    expect(Math.abs(day.totals.kcal - targets.kcalTarget)).toBeLessThanOrEqual(targets.kcalTarget * 0.15);
  });

  // X18 / C4: число приёмов — свободный выбор, дефицит держится на любой схеме
  it.each([2, 3, 4, 5] as MealCount[])("схема из %i приёмов держит калораж у цели", count => {
    const day = generateDay(targets, pool, { rhythm, mealCount: count });
    expect(Math.abs(day.totals.kcal - targets.kcalTarget)).toBeLessThanOrEqual(targets.kcalTarget * 0.15);
  });

  it("число приёмов в дне соответствует выбранной схеме", () => {
    expect(generateDay(targets, pool, { rhythm, mealCount: 2 }).meals).toHaveLength(2 + 1);
    expect(generateDay(targets, pool, { rhythm, mealCount: 3 }).meals).toHaveLength(3);
    expect(generateDay(targets, pool, { rhythm, mealCount: 4 }).meals).toHaveLength(4);
    expect(generateDay(targets, pool, { rhythm, mealCount: 5 }).meals).toHaveLength(5);
  });

  // регресс oheedet: добор белка тёк в самое калорийное блюдо и раздувал день до +35%
  it("добор белка не раздувает день выше +8% цели", () => {
    const lowProtein: Recipe[] = pool.map(r => ({ ...r, protein_g: 5 }));
    const day = generateDay({ ...targets, proteinGTarget: 200 }, lowProtein, { rhythm });
    expect(day.totals.kcal).toBeLessThanOrEqual(targets.kcalTarget * 1.08);
  });

  it("swapDish меняет блюдо того же слота и сохраняет баланс", () => {
    const p2 = [...pool, { id: "b2", name: "b2", meal_type: "breakfast", kcal: 320, protein_g: 22, fiber_g: 5, ingredients: [] } as Recipe];
    const day = generateDay(targets, p2, { rhythm });
    const i = day.meals.findIndex(m => m.slot === "breakfast");
    const before = day.meals[i].recipe.id;
    expect(swapDish(day, i, targets, p2)).toBe(true);
    expect(day.meals[i].recipe.id).not.toBe(before);
    expect(day.totals.kcal).toBeGreaterThan(0);
  });
});
