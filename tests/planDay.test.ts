import { describe, it, expect } from "vitest";
import { planDay } from "../src/planDay.js";
import { parseHM } from "../src/time.js";
const profile = { anchorWakeHM:"07:00", targetSleepMin:465, chronotype:"intermediate",
  caffeine:{ typicalMgPerDose:200, regularUser:true }, napPossibleByDefault:true, goal:"alertness" } as const;

describe("planDay", () => {
  it("normal day: windows sorted, has core kinds", () => {
    const p = planDay({ profile, ctx:{ date:"2026-06-28", mode:"normal", toggles:{} },
      lastNight:{ wokeHM:"07:00", bedHM:"23:00", quality:4 }, history:[] });
    const kinds = p.windows.map(w=>w.kind);
    expect(kinds).toContain("morning_light");
    expect(kinds).toContain("caffeine_last");
    expect(kinds).toContain("target_bed");
    const starts = p.windows.map(w=>w.startMin);
    expect(starts).toEqual([...starts].sort((a,b)=>a-b)); // отсортировано
  });
  it("bad night -> readiness in_debt + coffee_nap", () => {
    const p = planDay({ profile, ctx:{ date:"2026-06-28", mode:"normal", toggles:{} },
      lastNight:{ wokeHM:"07:00", bedHM:"02:00", quality:2 }, history:[] });
    expect(p.readiness.level).toBe("in_debt");
    expect(p.windows.some(w=>w.kind==="coffee_nap")).toBe(true);
  });
  it("napUnavailable -> a window shows the alternative action", () => {
    const p = planDay({ profile, ctx:{ date:"2026-06-28", mode:"normal", toggles:{ napUnavailable:true } },
      lastNight:{ wokeHM:"07:00", bedHM:"23:00", quality:4 }, history:[] });
    expect(p.windows.some(w=>/закрыт|дыхан|прогул/i.test(w.detail))).toBe(true);
  });
  it("crunch: bedtime after work end", () => {
    const p = planDay({ profile, ctx:{ date:"2026-06-28", mode:"crunch", crunchUntilHM:"27:00", toggles:{} },
      lastNight:{ wokeHM:"07:00", bedHM:"23:00", quality:3 }, history:[] });
    const bed = p.windows.find(w=>w.kind==="target_bed")!;
    expect(bed.startMin).toBe(parseHM("27:00") + 30);
  });
});
