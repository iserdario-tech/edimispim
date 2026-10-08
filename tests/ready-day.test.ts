import { describe, it, expect } from "vitest";
import { composeReadyDay, eachRU, animalOf, type ReadyItem } from "../src/food/ready";
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
  it("на двоих: цель общая, упаковки крупнее, подпись «каждому» понятна", () => {
    const two = { ...targets, kcalTarget: 3400, proteinGTarget: 240 };
    const d = composeReadyDay(two, 4, 3, undefined, 2);
    // вдвоём при четырёх приёмах шаг «по упаковке каждому» грубый: 12 % вместо 8 % (долг — порции свои у каждого)
    expect(Math.abs(d.totals.kcal - 3400) / 3400).toBeLessThanOrEqual(0.12);
    expect(d.totals.protein).toBeGreaterThanOrEqual(240 * 0.8);
    for (const off of [10, 11, 12, 13]) {
      const e = composeReadyDay(two, 5, off, undefined, 2);
      expect(Math.abs(e.totals.kcal - 3400) / 3400, `пять приёмов, день ${off}`).toBeLessThanOrEqual(0.08);
      expect(e.totals.protein, `пять приёмов, день ${off}`).toBeGreaterThanOrEqual(240 * 0.8);
    }
    // пополам, по одной или по две — никаких «по три четверти» и «по полторы»
    for (const p of d.picks) for (const part of p.parts) expect([1, 2, 4]).toContain(part.packs);
    expect(eachRU(1, 2)).toBe("по половине каждому");
    expect(eachRU(2, 2)).toBe("по одной каждому");
    expect(eachRU(4, 2)).toBe("по две каждому");
    expect(eachRU(1, 1)).toBe("");
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
    const mains = (off: number, people = 1) => composeReadyDay(people === 2 ? { ...targets, kcalTarget: 3600, proteinGTarget: 270 } : targets, 5, off, undefined, people)
      .picks.filter(p => p.slot !== "snack" && p.slot !== "dessert").flatMap(p => p.parts.map(x => x.item.xml_id));
    for (const people of [1, 2]) {
      let repeats = 0;
      for (let off = 10; off < 30; off++) { const y = new Set(mains(off - 1, people)); repeats += mains(off, people).filter(id => y.has(id)).length; }
      expect(repeats, `повторов со вчера за 20 дней (на ${people})`).toBeLessThanOrEqual(3);
    }
    expect(animalOf("Куриная грудка с грибами и пенне")).toBe("chicken");
    expect(animalOf("Говядина в томатном соусе с кабачками гриль и гречкой")).toBe("beef");
  });
  it("пустой каталог — пустой день, а не ошибка", () => {
    expect(composeReadyDay(targets, 4, 0, []).picks).toEqual([]);
  });
});
