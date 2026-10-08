import { describe, it, expect } from "vitest";
import { composeReadyDay, eachRU, splitRU, animalOf, type ReadyItem } from "../src/food/ready";
import type { Targets } from "../src/food/types";

const targets: Targets = { bmr: 1700, tdee: 2300, kcalTarget: 1800, proteinGTarget: 120, fiberGTarget: 30, tempoKgPerWeek: 0.5 };
let n = 0;
const item = (name: string, grams: number, kcal: number, protein: number, slots: string[], kind = "meat", price = 300): ReadyItem =>
  ({ id: ++n, xml_id: n, name, grams, kcal, protein, fat: 5, carbs: 10, fiber: kind === "salad" ? 2 : 0.5, price, slots, kind, url: "" });

// каталог-заглушка: по несколько вариантов на приём, с разной плотностью белка
const CATALOG: ReadyItem[] = [
  item("Омлет с курицей", 150, 160, 12, ["breakfast"], "eggs"), item("Каша овсяная", 250, 90, 3, ["breakfast"], "porridge"),
  item("Сырники", 200, 220, 14, ["breakfast"], "cottage"), item("Творог 5%", 350, 121, 16, ["breakfast", "snack"], "cottage", 237),
  item("Салат с курицей", 180, 120, 12, ["lunch", "dinner"], "salad"), item("Суп куриный", 390, 45, 4, ["lunch"], "soup"),
  item("Грудка запечённая", 140, 165, 28, ["lunch", "dinner"]), item("Боул с курицей", 230, 130, 10, ["lunch", "dinner"], "salad"),
  item("Форель на пару с овощами", 230, 78, 8, ["lunch", "dinner"], "fish"), item("Котлеты с гречкой", 300, 150, 10, ["lunch", "dinner"]),
  item("Яблоко", 150, 52, 0.4, ["snack"], "fruit", 40), item("Йогурт", 150, 70, 5, ["snack", "breakfast"], "yogurt", 90),
  item("Пудинг", 150, 120, 4, ["dessert", "snack"], "dessert"), item("Фруктовая нарезка", 200, 50, 1, ["snack", "dessert"], "fruit"),
];

describe("день без готовки", () => {
  it("собирается под калории дня из целых упаковок, по одному блюду на приём", () => {
    const day = composeReadyDay(targets, 4, 0, CATALOG);
    expect(day.picks.map(p => p.slot)).toEqual(["breakfast", "lunch", "dinner", "dessert"]);
    expect(Math.abs(day.totals.kcal - 1800) / 1800).toBeLessThanOrEqual(0.12);
    for (const p of day.picks) for (const part of p.parts) expect([0.5, 1, 2]).toContain(part.packs);
    // одно и то же блюдо дважды не ставится
    const ids = day.picks.flatMap(p => p.parts.map(part => part.item.xml_id));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("основные приёмы — с белком, не каша и не суп", () => {
    const day = composeReadyDay(targets, 4, 0, CATALOG);
    for (const p of day.picks.filter(p => p.slot === "lunch" || p.slot === "dinner")) expect(p.parts.reduce((s, part) => s + part.item.protein * part.item.grams / 100 * part.packs, 0)).toBeGreaterThanOrEqual(15);
  });
  it("разные даты дают разные наборы (на живом каталоге магазина)", () => {
    const sets = new Set([0, 1, 2, 3, 4, 5].map(off => composeReadyDay(targets, 4, off).picks.flatMap(p => p.parts.map(x => x.item.xml_id)).join()));
    expect(sets.size).toBeGreaterThan(3);
  });
  it("живой каталог: калории ±8 %, белок не ниже 85 % цели, жиры основных блюд в норме", () => {
    for (const off of [0, 7, 14, 21]) {
      const d = composeReadyDay(targets, 4, off);
      expect(Math.abs(d.totals.kcal - targets.kcalTarget) / targets.kcalTarget, `день ${off}`).toBeLessThanOrEqual(0.08);
      expect(d.totals.protein, `день ${off}`).toBeGreaterThanOrEqual(targets.proteinGTarget * 0.85);
      // жирные блюда не идут в обед и ужин; на завтраке омлет с сыром допустим — жиры дня держит оценка варианта
      for (const p of d.picks.filter(p => p.slot === "lunch" || p.slot === "dinner")) for (const part of p.parts) expect(part.item.fat * 9 / part.item.kcal, part.item.name).toBeLessThanOrEqual(0.4);
      expect(d.totals.fat * 9 / d.totals.kcal, `жиры дня ${off}`).toBeLessThanOrEqual(0.36);
    }
  });
  it("обед и ужин на живом каталоге — из двух частей: белковое и гарнир", () => {
    const mains = [0, 1, 2].flatMap(off => composeReadyDay(targets, 4, off).picks.filter(p => p.slot === "lunch" || p.slot === "dinner"));
    expect(mains.filter(p => p.parts.length === 2).length).toBeGreaterThanOrEqual(mains.length - 1);
  });
  it("на двоих: блюда общие, упаковок каждому по своей цели, каждому ±8 %", () => {
    const her: Targets = { ...targets, kcalTarget: 1400, proteinGTarget: 90 };
    for (const off of [3, 10, 11, 12, 13, 20]) {
      const d = composeReadyDay(targets, 5, off, undefined, her);
      expect(d.each, `день ${off}`).toBeDefined();
      expect(Math.abs(d.each![0].kcal - 1800) / 1800, `мне, день ${off}`).toBeLessThanOrEqual(0.08);
      expect(Math.abs(d.each![1].kcal - 1400) / 1400, `ей, день ${off}`).toBeLessThanOrEqual(0.08);
      expect(d.each![0].protein, `белок мне, день ${off}`).toBeGreaterThanOrEqual(120 * 0.8);
      expect(d.each![1].protein, `белок ей, день ${off}`).toBeGreaterThanOrEqual(90 * 0.8);
      for (const p of d.picks) for (const part of p.parts) {
        expect(part.each, part.item.name).toBeDefined();
        // общее блюдо — обоим, без нулей; упаковок каждому по своей цели («тебе две, ей одну»)
        if (p.slot === "lunch" || p.slot === "dinner") for (const x of part.each!) expect(x, `общее ${part.item.name}`).toBeGreaterThan(0);
        expect(part.packs).toBeCloseTo(part.each![0] + part.each![1]);
        for (const x of part.each!) expect([0, 0.5, 1, 1.5, 2]).toContain(x);
        expect(part.each![0] + part.each![1], part.item.name).toBeGreaterThan(0);
      }
    }
    // четыре приёма: шаг грубее, но каждому в пределах 10 %
    const d4 = composeReadyDay(targets, 4, 3, undefined, her);
    expect(Math.abs(d4.each![0].kcal - 1800) / 1800).toBeLessThanOrEqual(0.1);
    expect(Math.abs(d4.each![1].kcal - 1400) / 1400).toBeLessThanOrEqual(0.1);
    expect(eachRU(1, 2)).toBe("по половине каждому");
    expect(eachRU(2, 2)).toBe("по одной каждому");
    expect(eachRU(1, 1)).toBe("");
    expect(splitRU([1, 1], "ей")).toBe("по одной каждому");
    expect(splitRU([2, 1], "ей")).toBe("тебе две, ей одну");
    expect(splitRU([1, 0.5], "ему")).toBe("тебе одну, ему половину");
    expect(splitRU([0.5, 1])).toBe("тебе половину, партнёру одну");
    expect(splitRU([1, 0], "ей")).toBe("только тебе");
    expect(splitRU([0, 1], "ей")).toBe("только ей");
  });
  it("здравый смысл: завтрак — завтрачная еда, ужин без пасты и плова, белок обеда и ужина разный, вчерашние блюда не повторяются", () => {
    for (const off of [0, 1, 2, 3, 4, 5, 6, 30, 31]) {
      const d = composeReadyDay(targets, 5, off);
      const by = Object.fromEntries(d.picks.map(p => [p.slot, p.parts]));
      for (const part of by.breakfast ?? []) {
        expect(["cottage", "eggs", "porridge", "yogurt", "sandwich", "fruit", "bread"], `завтрак ${off}: ${part.item.name}`).toContain(part.item.kind);
        expect(part.item.name, `завтрак ${off}`).not.toMatch(/говядин|печень|свинин|индейк/i);
      }
      // ужин легче: без пасты, плова, риса и лапши (картошка и гречка — можно)
      for (const part of by.dinner ?? []) expect(part.item.name, `ужин ${off}`).not.toMatch(/паст[аы]|пенне|фарфалле|плов|\bрис\b|лапш|спагетти/i);
      const animals = (slot: string) => (by[slot] ?? []).filter(p => ["meat", "fish", "eggs"].includes(p.item.kind)).map(p => animalOf(p.item.name)).filter(a => a !== "other");
      for (const a of animals("lunch")) expect(animals("dinner"), `день ${off}: ${a} и в обед, и на ужин`).not.toContain(a);
    }
    // вчерашние завтрак, обед и ужин сегодня не повторяются; на стыке недель (якорь цепочки) повтор возможен
    const mains = (off: number, people = 1) => composeReadyDay(targets, 5, off, undefined, people === 2 ? { ...targets, kcalTarget: 1500, proteinGTarget: 100 } : undefined)
      .picks.filter(p => p.slot !== "snack" && p.slot !== "dessert").flatMap(p => p.parts.map(x => x.item.xml_id));
    for (const people of [1, 2]) {
      let repeats = 0;
      for (let off = 10; off < 30; off++) { const y = new Set(mains(off - 1, people)); repeats += mains(off, people).filter(id => y.has(id)).length; }
      expect(repeats, `повторов со вчера за 20 дней (на ${people})`).toBeLessThanOrEqual(4);
    }
    expect(animalOf("Куриная грудка с грибами и пенне")).toBe("chicken");
    expect(animalOf("Говядина в томатном соусе с кабачками гриль и гречкой")).toBe("beef");
  });
  it("пустой каталог — пустой день, а не ошибка", () => {
    expect(composeReadyDay(targets, 4, 0, []).picks).toEqual([]);
  });
});
