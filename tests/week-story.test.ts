import { describe, it, expect } from "vitest";
import { weekStory } from "../src/weekStory";
import type { DayRecord } from "../src/day-log";

// неделя с понедельника 28 сентября 2026
const d = (n: number) => n <= 30 ? `2026-09-${String(n).padStart(2, "0")}` : `2026-10-${String(n - 30).padStart(2, "0")}`;
const rec = (n: number, bed: string, q: 1 | 2 | 3 | 4 | 5, followed?: boolean, kg?: number): DayRecord => ({
  date: d(n), sleep: { wokeHM: "07:00", bedHM: bed, quality: q },
  ...(followed !== undefined ? { food: { followed } } : {}), ...(kg ? { body: { weightKg: kg } } : {}),
});

describe("история недели", () => {
  const week = [
    rec(28, "23:00", 4, true, 93.0), rec(29, "01:30", 2, false), rec(30, "23:10", 4, true),
    rec(31, "23:00", 4, true), rec(32, "23:30", 4, true), rec(33, "00:00", 3, false), rec(34, "23:00", 4, true, 92.4),
  ];
  const slides = weekStory(week, "2026-09-28", 480)!;
  it("сон — средняя длительность", () => {
    const s = slides.find(x => x.kind === "sleep")!;
    expect(s.big).toBe("7 ч 24");
    expect(s.bars).toHaveLength(7);
  });
  it("еда — дни по плану из отмеченных", () => {
    expect(slides.find(x => x.kind === "food")!.big).toBe("5 из 7");
  });
  it("вес — начало и конец недели", () => {
    expect(slides.find(x => x.kind === "weight")!.big).toBe("−0.6 кг");
  });
  it("заметили — плохие ночи по дням недели", () => {
    expect(slides.find(x => x.kind === "noticed")!.sub).toMatch(/вт/);
  });
  it("меньше четырёх дней данных — истории нет", () => {
    expect(weekStory(week.slice(0, 3), "2026-09-28", 480)).toBeNull();
  });
  it("без взвешиваний — без слайда про вес", () => {
    const noKg = week.map(r => ({ ...r, body: undefined }));
    expect(weekStory(noKg, "2026-09-28", 480)!.some(s => s.kind === "weight")).toBe(false);
  });
});
