import { describe, it, expect } from "vitest";
import { streakWithFreezes, unmarkedToday } from "../src/streak2";
import type { Day } from "../src/food/types";

// октябрь 2026: 5-е — понедельник
const d = (n: number) => `2026-10-${String(n).padStart(2, "0")}`;

describe("серия с заморозками", () => {
  it("пять дней подряд до вчера, сегодня ещё не отмечено — 5", () => {
    expect(streakWithFreezes([d(5), d(6), d(7), d(8), d(9)], [], d(10))).toBe(5);
  });
  it("сегодня отмечено — считается", () => {
    expect(streakWithFreezes([d(8), d(9), d(10)], [], d(10))).toBe(3);
  });
  it("один пропуск внутри недели гасится заморозкой", () => {
    expect(streakWithFreezes([d(5), d(6), d(7), d(9), d(10)], [], d(10))).toBe(5);
  });
  it("три пропуска за неделю — серия рвётся на третьем", () => {
    // 10 отмечен; 9, 8 — пропуски (2 заморозки); 7 отмечен; 6 — третий пропуск → стоп
    expect(streakWithFreezes([d(5), d(7), d(10)], [], d(10))).toBe(2);
  });
  it("свободный день (читмил) не рвёт серию и засчитывается", () => {
    expect(streakWithFreezes([d(8), d(10)], [d(9)], d(10))).toBe(3);
  });
  it("нет отметок — ноль", () => {
    expect(streakWithFreezes([], [], d(10))).toBe(0);
  });
});

describe("цифра на иконке", () => {
  const day = { meals: [{ slot: "breakfast" }, { slot: "lunch" }, { slot: "dinner" }], totals: { kcal: 0, protein: 0, fiber: 0 } } as unknown as Day;
  it("сколько приёмов не отмечено", () => {
    expect(unmarkedToday(day, { planned: 3, marks: { breakfast: "ate" } })).toBe(2);
    expect(unmarkedToday(null, undefined)).toBe(0);
  });
});
