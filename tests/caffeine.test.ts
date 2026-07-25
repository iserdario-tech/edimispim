import { describe, it, expect } from "vitest";
import { caffeineWindows } from "../src/caffeine.js";
import { parseHM } from "../src/time.js";
const profile = { anchorWakeHM:"07:00", targetSleepMin:465, chronotype:"intermediate",
  caffeine:{ typicalMgPerDose:200, regularUser:true }, napPossibleByDefault:true, goal:"alertness" } as const;

describe("caffeine", () => {
  // Пороги подняты по мета-анализу [B-034]: чашка заметна 8.8 ч, крупная доза — 13.2 ч.
  // 200 мг в профиле — это уже «крупная доза» (порог 150 мг).
  it("крупная доза -> отсечка за 13 ч до сна", () => {
    const w = caffeineWindows({ profile, bedMin: parseHM("23:00"), mode:"normal", toggles:{}, badNight:false });
    const last = w.find(x=>x.kind==="caffeine_last")!;
    expect(last.startMin).toBe(parseHM("10:00")); // 23:00 - 13ч
    expect(last.available).toBe(true);
  });
  it("умеренная доза -> отсечка за 9 ч до сна", () => {
    const mild = { ...profile, caffeine: { typicalMgPerDose: 95, regularUser: true } } as const;
    const w = caffeineWindows({ profile: mild, bedMin: parseHM("23:00"), mode:"normal", toggles:{}, badNight:false });
    expect(w.find(x=>x.kind==="caffeine_last")!.startMin).toBe(parseHM("14:00")); // 23:00 - 9ч
  });
  it("день восстановления -> жёсткая ранняя отсечка (13 ч)", () => {
    const w = caffeineWindows({ profile, bedMin: parseHM("23:00"), mode:"recovery", toggles:{}, badNight:true });
    const last = w.find(x=>x.kind==="caffeine_last")!;
    expect(last.startMin).toBe(parseHM("10:00")); // 23:00 - 13ч
  });
  it("noCaffeine toggle -> no caffeine window", () => {
    const w = caffeineWindows({ profile, bedMin: parseHM("23:00"), mode:"normal", toggles:{ noCaffeine:true }, badNight:false });
    expect(w).toHaveLength(0);
  });
});
