import { describe, it, expect } from "vitest";
import { planDay, runScreener } from "../src/index.js";
const profile = { anchorWakeHM:"07:00", targetSleepMin:465, chronotype:"intermediate",
  caffeine:{ typicalMgPerDose:200, regularUser:true }, napPossibleByDefault:true, goal:"alertness" } as const;

describe("scenarios (public API)", () => {
  it("office day without nap or light: plan still complete + honest notes", () => {
    const p = planDay({ profile,
      ctx:{ date:"2026-06-28", mode:"normal", toggles:{ napUnavailable:true, noBrightLight:true } },
      lastNight:{ wokeHM:"07:00", bedHM:"00:30", quality:3 }, history:[] });
    expect(p.windows.length).toBeGreaterThan(0);
    const details = p.windows.map(w => w.detail).join(" ");
    expect(details).toMatch(/улиц|лампа/i);          // свет заменён альтернативой
    expect(details).toMatch(/закрыт|дыхан|прогул/i); // нап заменён альтернативой
    expect(p.windows.every(w => w.why.length > 0)).toBe(true);
  });
  it("recovery day after crunch: coffee_nap present, caffeine cutoff earlier than normal", () => {
    const rec = planDay({ profile, ctx:{ date:"2026-06-29", mode:"recovery", toggles:{} },
      lastNight:{ wokeHM:"09:30", bedHM:"03:30", quality:2 }, history:[] });
    expect(rec.windows.some(w=>w.kind==="coffee_nap")).toBe(true);
    const recCut = rec.windows.find(w=>w.kind==="caffeine_last")!.startMin;
    const norm = planDay({ profile, ctx:{ date:"2026-06-29", mode:"normal", toggles:{} },
      lastNight:{ wokeHM:"07:00", bedHM:"23:00", quality:4 }, history:[] });
    const normCut = norm.windows.find(w=>w.kind==="caffeine_last")!.startMin;
    expect(recCut).toBeLessThan(normCut); // отсечка 10ч раньше 6/8ч
  });
  it("screener integrates via public API", () => {
    const r = runScreener({ loudSnoringWithPauses:true, daytimeSleepyDespiteEnoughSleep:true,
      legUrgeToMoveEvening:false, insomnia3xWeek3Months:false, lowMood2Weeks:false, selfHarmThoughts:false });
    expect(r.flagged).toBe(true);
  });
});
