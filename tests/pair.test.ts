import { describe, it, expect } from "vitest";
import { menuOf, mergeSwaps, pairFactor, withPartnerSwaps, byPartner } from "../src/pair";

/**
 * «Готовим вдвоём»: меню общее (его задаёт тот, кто создал пару), порции у каждого свои,
 * покупки — на обоих. Меню партнёру приходит как набор «ручных замен»: планировщик
 * собирает те же блюда, но под его калории.
 */
const day = (slots: [string, string][]) => ({ meals: slots.map(([slot, id]) => ({ slot, recipe: { id } })) });

describe("общее меню", () => {
  it("меню недели — дата → приём → блюдо", () => {
    expect(menuOf([{ date: "2026-10-07", day: day([["breakfast", "b1"], ["dinner", "d4"]]) }]))
      .toEqual({ "2026-10-07": { breakfast: "b1", dinner: "d4" } });
  });
  it("у партнёра меню пары, а его собственная замена — поверх", () => {
    const pair = { "2026-10-07": { lunch: "l1", dinner: "d4" } };
    const own = { "2026-10-07": { dinner: "d9" } };
    expect(mergeSwaps(pair, own)).toEqual({ "2026-10-07": { lunch: "l1", dinner: "d9" } });
  });
  it("без пары — свои замены как есть", () => {
    expect(mergeSwaps(undefined, { x: { a: "1" } })).toEqual({ x: { a: "1" } });
  });
});

describe("замены обоих", () => {
  const D = "2026-10-08";
  it("замена партнёра попадает в моё меню", () => {
    expect(withPartnerSwaps({ [D]: { lunch: "l1" } }, {}, { [D]: { dinner: ["d9", 100] } }))
      .toEqual({ [D]: { lunch: "l1", dinner: "d9" } });
  });
  it("на один приём побеждает более поздняя замена", () => {
    expect(withPartnerSwaps({ [D]: { dinner: "d2" } }, { [D]: { dinner: ["d2", 200] } }, { [D]: { dinner: ["d9", 100] } }))
      .toEqual({ [D]: { dinner: "d2" } });
    expect(withPartnerSwaps({ [D]: { dinner: "d2" } }, { [D]: { dinner: ["d2", 100] } }, { [D]: { dinner: ["d9", 200] } }))
      .toEqual({ [D]: { dinner: "d9" } });
  });
  it("подпись «от партнёра» — только если стоит именно его блюдо", () => {
    const theirs = { [D]: { dinner: ["d9", 200] as [string, number] } };
    expect(byPartner(D, "dinner", "d9", {}, theirs)).toBe(true);
    expect(byPartner(D, "dinner", "d1", {}, theirs)).toBe(false);   // блюда нет в моём наборе — осталось моё
    expect(byPartner(D, "dinner", "d9", { [D]: { dinner: ["d9", 300] } }, theirs)).toBe(false);
  });
});

describe("покупки на двоих", () => {
  it("моя порция + порция партнёра по его калориям", () => {
    expect(pairFactor(2400, 1600)).toBeCloseTo(1.65, 2);  // 1 + 1600/2400 ≈ 1.67 → шаг 0.05
    expect(pairFactor(1600, 2400)).toBeCloseTo(2.5, 2);   // у партнёра порции в полтора раза больше
  });
  it("нет данных партнёра — как будто порции одинаковые", () => {
    expect(pairFactor(2000, undefined)).toBe(2);
  });
  it("странные цифры не раздувают список", () => {
    expect(pairFactor(2000, 50)).toBe(1.3);
    expect(pairFactor(1000, 9000)).toBe(3);
  });
});
