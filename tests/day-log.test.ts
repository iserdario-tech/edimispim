import { describe, it, expect } from "vitest";
import { upsertDay, lastNightBefore, dayOf, MAX_DAYS, type DayRecord } from "../src/day-log";

const sleep = (date: string, quality: 1 | 2 | 3 | 4 | 5 = 4): DayRecord =>
  ({ date, sleep: { wokeHM: "07:00", quality } });

describe("upsertDay", () => {
  it("добавляет новый день и держит порядок по дате", () => {
    let days: DayRecord[] = [];
    days = upsertDay(days, sleep("2026-07-03"));
    days = upsertDay(days, sleep("2026-07-01"));
    expect(days.map(d => d.date)).toEqual(["2026-07-01", "2026-07-03"]);
  });

  it("дополняет существующий день, а не затирает его", () => {
    let days = upsertDay([], sleep("2026-07-01"));
    days = upsertDay(days, { date: "2026-07-01", body: { weightKg: 82.4 } });
    expect(days).toHaveLength(1);
    expect(days[0]!.sleep?.quality).toBe(4);          // сон на месте
    expect(days[0]!.body?.weightKg).toBe(82.4);       // вес добавился
  });

  it("еда сливается по полям, а не заменяется целиком", () => {
    let days = upsertDay([], { date: "2026-07-01", food: { plannedKcal: 1700 } });
    days = upsertDay(days, { date: "2026-07-01", food: { followed: true } });
    expect(days[0]!.food).toEqual({ plannedKcal: 1700, followed: true });
  });

  it("history обрезается до предела и оставляет свежее", () => {
    let days: DayRecord[] = [];
    for (let i = 0; i < MAX_DAYS + 20; i++) {
      days = upsertDay(days, sleep(`2026-${String(1 + Math.floor(i / 28)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`));
    }
    expect(days).toHaveLength(MAX_DAYS);
  });
});

describe("выборки", () => {
  const days = [sleep("2026-07-01"), { date: "2026-07-02", body: { weightKg: 80 } }, sleep("2026-07-03", 2)];

  it("dayOf находит день по дате", () => {
    expect(dayOf(days, "2026-07-02")?.body?.weightKg).toBe(80);
    expect(dayOf(days, "2026-07-09")).toBeUndefined();
  });

  it("lastNightBefore берёт ближайшую ночь, пропуская дни без сна", () => {
    expect(lastNightBefore(days, "2026-07-02")?.date).toBe("2026-07-01");
    expect(lastNightBefore(days, "2026-07-03")?.date).toBe("2026-07-03");
  });

  it("нет ночей — не падает", () => {
    expect(lastNightBefore([], "2026-07-01")).toBeUndefined();
  });
});
