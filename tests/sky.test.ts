import { describe, it, expect } from "vitest";
import { skyFor } from "../src/sky";

const hm = (h: number, m = 0) => h * 60 + m;

describe("небо по времени суток", () => {
  it("утро — персиковое", () => {
    expect(skyFor(hm(7, 10), false)).toMatchObject({ phase: "morning", night: false });
  });
  it("день — голубое", () => {
    expect(skyFor(hm(12, 20), false)).toMatchObject({ phase: "day", night: false });
  });
  it("вечер и ночь — индиго, текст светлый", () => {
    expect(skyFor(hm(21, 40), false)).toMatchObject({ phase: "night", night: true });
    expect(skyFor(hm(3, 0), false)).toMatchObject({ phase: "night", night: true });
  });
  it("тёмная тема — всегда ночное небо", () => {
    expect(skyFor(hm(12, 0), true)).toMatchObject({ phase: "night", night: true });
  });
  it("границы: 05:00 уже утро, 18:00 уже вечер", () => {
    expect(skyFor(hm(5), false).phase).toBe("morning");
    expect(skyFor(hm(18), false).phase).toBe("night");
  });
  it("время после полуночи в минутах плана (>1440) понимается правильно", () => {
    expect(skyFor(hm(25), false).phase).toBe("night");
  });
});
