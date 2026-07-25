import { describe, it, expect } from "vitest";
import { computeBedMin } from "../src/modes.js";
import { parseHM } from "../src/time.js";
const profile = { anchorWakeHM:"07:00", targetSleepMin:465, chronotype:"intermediate",
  caffeine:{ typicalMgPerDose:200, regularUser:true }, napPossibleByDefault:true, goal:"alertness" } as const;

describe("modes", () => {
  it("normal: bed = wake - targetSleep (previous evening)", () => {
    const r = computeBedMin({ profile, ctx:{ date:"2026-06-28", mode:"normal", toggles:{} }, lastNight:{ wokeHM:"07:00", bedHM:"23:00", quality:4 } });
    expect(r.wakeMin).toBe(parseHM("07:00"));
    expect(r.bedMin).toBe(parseHM("07:00") + 1440 - 465); // отбой = подъём(+1день) - цель сна = 23:15
  });
  it("recovery: bed pulled earlier than normal", () => {
    const norm = computeBedMin({ profile, ctx:{ date:"2026-06-28", mode:"normal", toggles:{} }, lastNight:{ wokeHM:"07:00", quality:2 } });
    const rec = computeBedMin({ profile, ctx:{ date:"2026-06-28", mode:"recovery", toggles:{} }, lastNight:{ wokeHM:"07:00", quality:2 } });
    expect(rec.bedMin).toBeLessThan(norm.bedMin);
  });
  it("bad night when quality<=2", () => {
    const r = computeBedMin({ profile, ctx:{ date:"2026-06-28", mode:"normal", toggles:{} }, lastNight:{ wokeHM:"07:00", bedHM:"02:00", quality:2 } });
    expect(r.badNight).toBe(true);
  });
});
