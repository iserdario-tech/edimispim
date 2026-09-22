import { describe, it, expect } from "vitest";
import { sleepFoodLink, monthRecap } from "../src/sleep-food";
import type { DayRecord } from "../src/day-log";

const d = (date: string, quality: 1 | 2 | 3 | 4 | 5, followed?: boolean, bedHM?: string, kg?: number): DayRecord => ({
  date,
  sleep: { wokeHM: "07:00", quality, ...(bedHM ? { bedHM } : {}) },
  ...(followed !== undefined ? { food: { followed } } : {}),
  ...(kg ? { body: { weightKg: kg } } : {}),
});

describe("сон и еда у тебя", () => {
  it("пока в какой-то группе меньше трёх дней — не готово, и видно, сколько есть", () => {
    const r = sleepFoodLink([d("2026-09-01", 4, true), d("2026-09-02", 4, true), d("2026-09-03", 2, false)], 480);
    expect(r.ready).toBe(false);
    if (!r.ready) { expect(r.good).toBe(2); expect(r.rough).toBe(1); }
  });
  it("делит дни по ночи перед ними и считает дни по плану", () => {
    const days = [
      d("2026-09-01", 4, true), d("2026-09-02", 5, true), d("2026-09-03", 4, false), d("2026-09-04", 4, true),
      d("2026-09-05", 2, false), d("2026-09-06", 1, false), d("2026-09-07", 2, true),
    ];
    const r = sleepFoodLink(days, 480);
    expect(r).toEqual({ ready: true, good: { followed: 3, total: 4 }, rough: { followed: 1, total: 3 } });
  });
  it("короткая ночь при хорошей оценке — тоже плохая", () => {
    const days = [d("2026-09-01", 4, false, "02:30"), d("2026-09-02", 4, false, "02:00"), d("2026-09-03", 4, true, "01:50"),
                  d("2026-09-04", 4, true, "23:00"), d("2026-09-05", 4, true, "23:00"), d("2026-09-06", 4, true, "23:10")];
    const r = sleepFoodLink(days, 480);
    expect(r).toEqual({ ready: true, good: { followed: 3, total: 3 }, rough: { followed: 1, total: 3 } });
  });
  it("дни без отметок еды не учитываются", () => {
    const r = sleepFoodLink([d("2026-09-01", 4), d("2026-09-02", 2)], 480);
    expect(r.ready).toBe(false);
    if (!r.ready) { expect(r.good).toBe(0); expect(r.rough).toBe(0); }
  });
});

describe("итог месяца", () => {
  const days = [
    d("2026-08-01", 4, true, "23:00", 93.0), d("2026-08-02", 4, true, "23:30"), d("2026-08-03", 2, false, "01:00"),
    d("2026-08-10", 4, true), d("2026-08-20", 3, true), d("2026-08-25", 4, false), d("2026-08-31", 4, true, undefined, 91.2),
    d("2026-09-01", 4, true, "23:00", 90.9),
  ];
  it("считает только свой месяц", () => {
    const r = monthRecap(days, "2026-08")!;
    expect(r.nights).toBe(7);
    expect(r.followed).toBe(5);
    expect(r.marked).toBe(7);
    expect(r.weightFrom).toBe(93.0);
    expect(r.weightTo).toBe(91.2);
  });
  it("средний сон — только по ночам с известным отбоем", () => {
    const r = monthRecap(days, "2026-08")!;
    expect(r.avgSleepMin).toBe(Math.round((480 + 450 + 360) / 3));
  });
  it("меньше недели данных — итога нет", () => {
    expect(monthRecap(days, "2026-09")).toBeNull();
  });
});
