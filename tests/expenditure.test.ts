import { describe, it, expect } from "vitest";
import { expenditure } from "../src/expenditure";
import type { DayEaten } from "../src/food/eaten";

const START = "2026-07-01";
const iso = (n: number) => new Date(Date.parse(START + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
// детерминированный «шум» веса ±0.3 кг — как вода и соль
const noise = (n: number) => Math.sin(n * 12.9898) * 0.3;

function build(days: number, opts: { lossPerDay: number; weighEvery?: number; logged?: (n: number) => boolean }) {
  const weights: { date: string; kg: number }[] = [];
  const eaten: Record<string, DayEaten> = {};
  for (let n = 0; n <= days; n++) {
    if (n % (opts.weighEvery ?? 1) === 0) weights.push({ date: iso(n), kg: +(95 - opts.lossPerDay * n + noise(n)).toFixed(1) });
    if (opts.logged?.(n) ?? true) {
      eaten[iso(n)] = { planned: 4, marks: { breakfast: "ate", lunch: "ate", dessert: "ate", dinner: "ate" } };
    }
  }
  return { weights, eaten };
}
const base = { startISO: START, mealCount: 4 as const, targetOf: () => 2000, currentTarget: 2000 };

describe("реальный расход по весу", () => {
  it("раньше 28 дней — только ждём и говорим сколько", () => {
    const d = build(20, { lossPerDay: 0.05 });
    const r = expenditure({ ...base, ...d, today: iso(20) });
    expect(r).toEqual({ status: "wait", daysLeft: 8 });
  });
  it("вес раз в неделю — мало для оценки, и видно, сколько надо", () => {
    const d = build(50, { lossPerDay: 0.05, weighEvery: 7 });
    const r = expenditure({ ...base, ...d, today: iso(50) });
    expect(r.status).toBe("data");
  });
  it("незаписанные дни не считаются нулём — но если их много, оценки нет", () => {
    const d = build(50, { lossPerDay: 0.05, logged: n => n % 2 === 0 });
    expect(expenditure({ ...base, ...d, today: iso(50) }).status).toBe("data");
  });
  it("худеет быстрее формулы — расход выше, поправка вверх не больше +150", () => {
    // 0.1 кг/д ≈ 770 ккал дефицита на 2000 ккал → расход ≈ 2770, цель по оценке ≈ 2220
    const d = build(50, { lossPerDay: 0.1 });
    const r = expenditure({ ...base, ...d, today: iso(50) });
    expect(r.status).toBe("ready");
    if (r.status === "ready") {
      expect(r.tdee).toBeGreaterThan(2600);
      expect(r.tdee).toBeLessThan(2950);
      // ½ × (оценка − дефицит − текущая цель), округлено до 10, в пределах +150
      expect(r.step).toBe(Math.round(Math.min(150, (r.tdee - 550 - 2000) / 2) / 10) * 10);
      expect(r.step).toBeGreaterThan(0);
      expect(r.ci).toBeLessThanOrEqual(250);
    }
  });
  it("худеет медленнее — поправка вниз, но не больше −150 за раз", () => {
    const d = build(50, { lossPerDay: 0.0 });
    const r = expenditure({ ...base, ...d, today: iso(50) });
    expect(r.status).toBe("ready");
    if (r.status === "ready") expect(r.step).toBe(-150);
  });
  it("после поправки следующая — не раньше чем через 2 недели", () => {
    const d = build(50, { lossPerDay: 0.0 });
    const r = expenditure({ ...base, ...d, today: iso(50), lastAdjustISO: iso(44) });
    expect(r.status).toBe("ready");
    if (r.status === "ready") expect(r.nextChangeInDays).toBe(8);
  });
});

describe("поправка нормы не переписывает прошлое", () => {
  it("съеденное считается по калорийности, записанной в день отметки", () => {
    const d = build(50, { lossPerDay: 0.05 });
    for (const e of Object.values(d.eaten)) e.dayKcal = 2000;
    const a = expenditure({ ...base, ...d, today: iso(50) });
    // норму потом снизили — прошлые дни всё равно по 2000
    const b = expenditure({ ...base, ...d, today: iso(50), targetOf: () => 1850, currentTarget: 1850 });
    expect(a.status).toBe("ready"); expect(b.status).toBe("ready");
    if (a.status === "ready" && b.status === "ready") expect(b.tdee).toBe(a.tdee);
  });
});
