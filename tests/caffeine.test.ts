import { describe, it, expect } from "vitest";
import { caffeineWindows } from "../src/caffeine.js";
import { parseHM } from "../src/time.js";
const profile = { anchorWakeHM:"07:00", targetSleepMin:465, chronotype:"intermediate",
  caffeine:{ typicalMgPerDose:200, regularUser:true }, napPossibleByDefault:true, goal:"alertness" } as const;

describe("caffeine", () => {
  it("moderate dose -> cutoff 6h before bed", () => {
    const w = caffeineWindows({ profile, bedMin: parseHM("23:00"), mode:"normal", toggles:{}, badNight:false });
    const last = w.find(x=>x.kind==="caffeine_last")!;
    expect(last.startMin).toBe(parseHM("17:00")); // 23:00 - 6h
    expect(last.available).toBe(true);
  });
  it("recovery mode -> earlier hard cutoff (10h)", () => {
    const w = caffeineWindows({ profile, bedMin: parseHM("23:00"), mode:"recovery", toggles:{}, badNight:true });
    const last = w.find(x=>x.kind==="caffeine_last")!;
    expect(last.startMin).toBe(parseHM("13:00")); // 23:00 - 10h
  });
  it("noCaffeine toggle -> no caffeine window", () => {
    const w = caffeineWindows({ profile, bedMin: parseHM("23:00"), mode:"normal", toggles:{ noCaffeine:true }, badNight:false });
    expect(w).toHaveLength(0);
  });
});
