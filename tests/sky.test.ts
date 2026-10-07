import { describe, it, expect } from "vitest";
import { skyFor, skyGlow, skyTopColor } from "../src/sky";

const hm = (h: number, m = 0) => h * 60 + m;

describe("свечение неба по времени суток", () => {
  it("утро — тёплое оранжевое", () => {
    expect(skyFor(hm(7, 10), false)).toMatchObject({ phase: "morning", night: false, glow: "#FFE74C" });
  });
  it("день — голубое", () => {
    expect(skyFor(hm(12, 20), false)).toMatchObject({ phase: "day", night: false, glow: "#35A7FF" });
  });
  it("вечер и ночь — индиго, но светлая тема остаётся светлой", () => {
    expect(skyFor(hm(21, 40), false)).toMatchObject({ phase: "night", night: false, glow: "#38618C" });
    expect(skyFor(hm(3, 0), false).phase).toBe("night");
  });
  it("тёмная гамма — только по теме телефона, фаза — по часам", () => {
    expect(skyFor(hm(12, 0), true)).toMatchObject({ phase: "day", night: true });
  });
  it("границы: 05:00 уже утро, 18:00 уже вечер", () => {
    expect(skyFor(hm(5), false).phase).toBe("morning");
    expect(skyFor(hm(18), false).phase).toBe("night");
  });
  it("время после полуночи в минутах плана (>1440) понимается правильно", () => {
    expect(skyFor(hm(25), false).phase).toBe("night");
  });
  it("свечение — полупрозрачный цвет сверху, в тёмной теме чуть ярче", () => {
    expect(skyGlow("#FF9F0A", false)).toContain("rgba(255, 159, 10, 0.25)");
    expect(skyGlow("#FF9F0A", true)).toContain("rgba(255, 159, 10, 0.4)");
  });
  it("верх экрана — фон, подкрашенный свечением: под этот цвет красится полоса под часами", () => {
    expect(skyTopColor("#38618C", true)).toBe("#172A40");   // синий вечер на тёмно-синем
    expect(skyTopColor("#FFE74C", false)).toBe("#FFFBE0");  // жёлтое утро на белом
  });
});
