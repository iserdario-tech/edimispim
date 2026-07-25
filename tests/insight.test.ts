import { describe, it, expect } from "vitest";
import { weeklyInsight, streakDays } from "../src/insight.js";
import { computeReadiness } from "../src/readiness.js";
import { planDay } from "../src/planDay.js";

const profile = { anchorWakeHM: "07:00", targetSleepMin: 465, chronotype: "intermediate",
  caffeine: { typicalMgPerDose: 200, regularUser: true }, napPossibleByDefault: true, goal: "alertness" } as const;
const day = (iso: string, wokeHM: string, quality: 1|2|3|4|5, bedHM?: string) => ({ date: iso, wokeHM, quality, ...(bedHM ? { bedHM } : {}) });
const drinkDay = (iso: string) => ({ date: iso, wokeHM: "07:00", quality: 2 as const, hadAlcohol: true });

describe("weeklyInsight", () => {
  it("empty -> nudge to log", () => {
    const w = weeklyInsight([], "2026-07-12", 465);
    expect(w.daysLogged).toBe(0);
    expect(w.avgQuality).toBeNull();
    expect(w.avgSleepMin).toBeNull();
    expect(w.summaryRU).toMatch(/отмечайся/i);
  });
  it("counts only last 7 days, averages quality + sleep", () => {
    const hist = [
      day("2026-07-12", "07:00", 4, "23:00"), // 8ч
      day("2026-07-11", "07:00", 2, "01:00"), // 6ч
      day("2026-07-01", "07:00", 5, "23:00"), // вне окна 7 дней
    ];
    const w = weeklyInsight(hist, "2026-07-12", 465);
    expect(w.daysLogged).toBe(2);
    expect(w.avgQuality).toBe(3);       // (4+2)/2
    expect(w.avgSleepMin).toBe(420);    // (480+360)/2
  });
  it("regularity high when wake times stable", () => {
    const hist = [10,11,12].map(d => day(`2026-07-${d}`, "07:00", 3));
    expect(weeklyInsight(hist, "2026-07-12", 465).regularity).toBe(100);
  });
  it("counts alcohol nights in last 7 and warns at 3+", () => {
    const hist = ["2026-07-10","2026-07-11","2026-07-12"].map(drinkDay);
    const w = weeklyInsight(hist, "2026-07-12", 465);
    expect(w.alcoholNights).toBe(3);
    expect(w.summaryRU).toMatch(/алкоголь/i);
  });
});

describe("streakDays", () => {
  it("consecutive days ending today", () => {
    const hist = ["2026-07-10","2026-07-11","2026-07-12"].map(d => day(d, "07:00", 3));
    expect(streakDays(hist, "2026-07-12")).toBe(3);
  });
  it("counts back from yesterday if today not yet logged", () => {
    const hist = ["2026-07-10","2026-07-11"].map(d => day(d, "07:00", 3));
    expect(streakDays(hist, "2026-07-12")).toBe(2);
  });
  it("gap breaks the streak", () => {
    const hist = ["2026-07-09","2026-07-11","2026-07-12"].map(d => day(d, "07:00", 3));
    expect(streakDays(hist, "2026-07-12")).toBe(2); // 12,11 подряд; 10 пропущен
  });
  it("no marks -> 0", () => {
    expect(streakDays([], "2026-07-12")).toBe(0);
  });
});

describe("alcohol toggle", () => {
  it("caps readiness below charged", () => {
    const hist = [1,2,3].map(d => day(`2026-06-0${d}`, "07:00", 4, "23:00"));
    const good = { profile, lastNight: { wokeHM: "07:00", bedHM: "23:00", quality: 5 as const }, history: hist };
    expect(computeReadiness(good).level).toBe("charged");
    expect(computeReadiness({ ...good, hadAlcohol: true }).level).toBe("ok");
  });
  it("adds an honest alcohol note to the plan", () => {
    const plan = planDay({ profile, ctx: { date: "2026-07-12", mode: "normal", toggles: { hadAlcohol: true } },
      lastNight: { wokeHM: "07:00", quality: 3 }, history: [] });
    expect(plan.notesRU.some(n => /алкоголь/i.test(n))).toBe(true);
  });
});
