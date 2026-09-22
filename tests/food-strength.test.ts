import { describe, it, expect } from "vitest";
import { strengthProtein } from "../src/food/targets";

describe("белок при регулярных силовых (research-2026-09-23, T4)", () => {
  it("1.6 г/кг текущего веса, если ИМТ ниже 30", () => {
    expect(strengthProtein({ weightKg: 80, heightCm: 180 })).toBe(128);
  });
  it("при ожирении — на вес при ИМТ 30, а не на полный", () => {
    // 180 см → ИМТ 30 при 97.2 кг; при 120 кг считаем от 97.2
    expect(strengthProtein({ weightKg: 120, heightCm: 180 })).toBe(Math.round(1.6 * 97.2));
  });
});
