import { describe, it, expect } from "vitest";
import { computeReadiness, sleepDurationMin } from "../src/readiness.js";
const profile = { anchorWakeHM:"07:00", targetSleepMin:465, chronotype:"intermediate",
  caffeine:{ typicalMgPerDose:200, regularUser:true }, napPossibleByDefault:true, goal:"alertness" } as const;

describe("readiness", () => {
  it("duration across midnight", () => {
    expect(sleepDurationMin({ wokeHM:"07:00", bedHM:"23:00", quality:4 }, 465)).toBe(480); // 8h
  });
  it("short + poor -> in_debt", () => {
    const r = computeReadiness({ profile, lastNight:{ wokeHM:"07:00", bedHM:"02:00", quality:2 }, history:[] });
    expect(r.level).toBe("in_debt");
    expect(r.priorityRU).toMatch(/нап|отбой|раньше/i);
  });
  it("full + good + regular -> charged", () => {
    const hist = [1,2,3].map(d=>({date:`2026-06-0${d}`, wokeHM:"07:00", bedHM:"23:00", quality:4 as const}));
    const r = computeReadiness({ profile, lastNight:{ wokeHM:"07:00", bedHM:"23:00", quality:5 }, history:hist });
    expect(r.level).toBe("charged");
  });
});
