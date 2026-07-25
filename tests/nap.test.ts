import { describe, it, expect } from "vitest";
import { napWindow } from "../src/nap.js";
import { parseHM } from "../src/time.js";
const profile = { anchorWakeHM:"07:00", targetSleepMin:465, chronotype:"intermediate",
  caffeine:{ typicalMgPerDose:200, regularUser:true }, napPossibleByDefault:true, goal:"alertness" } as const;

describe("nap", () => {
  it("places nap ~7h after wake, capped before bed", () => {
    const w = napWindow({ profile, wakeMin: parseHM("07:00"), bedMin: parseHM("23:00"), mode:"normal", toggles:{}, badNight:false })!;
    expect(w.kind).toBe("nap");
    expect(w.startMin).toBe(parseHM("14:00")); // 07:00 + 7h
    expect(w.endMin! - w.startMin).toBe(20);
    expect(w.available).toBe(true);
  });
  it("napUnavailable -> shows alternative action", () => {
    const w = napWindow({ profile, wakeMin: parseHM("07:00"), bedMin: parseHM("23:00"), mode:"normal", toggles:{ napUnavailable:true }, badNight:false })!;
    expect(w.detail).toMatch(/закрыт|дыхан|прогул/i);
  });
  it("recovery/bad night -> coffee_nap preset", () => {
    const w = napWindow({ profile, wakeMin: parseHM("07:00"), bedMin: parseHM("23:00"), mode:"recovery", toggles:{}, badNight:true })!;
    expect(w.kind).toBe("coffee_nap");
    expect(w.detail).toMatch(/кофе/i);
  });
});
