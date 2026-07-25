import { describe, it, expect } from "vitest";
import { planDay } from "../src/index.js";
import { toPlanView } from "../src/ui/viewModel.js";
const profile = { anchorWakeHM:"07:00", targetSleepMin:465, chronotype:"intermediate",
  caffeine:{ typicalMgPerDose:200, regularUser:true }, napPossibleByDefault:true, goal:"alertness" } as const;

describe("viewModel", () => {
  it("maps plan to rows with formatted times and icons", () => {
    const plan = planDay({ profile, ctx:{ date:"2026-06-28", mode:"normal", toggles:{} },
      lastNight:{ wokeHM:"07:00", bedHM:"23:00", quality:4 }, history:[] });
    const v = toPlanView(plan);
    const light = v.rows.find(r=>r.title.toLowerCase().includes("свет"))!;
    expect(light.time).toBe("07:00");
    expect(light.icon.length).toBeGreaterThan(0);
    expect(v.readiness.label.length).toBeGreaterThan(0);
  });
  it("marks past steps and picks next by current time", () => {
    const plan = planDay({ profile, ctx:{ date:"2026-06-28", mode:"normal", toggles:{} },
      lastNight:{ wokeHM:"07:00", bedHM:"23:00", quality:4 }, history:[] });
    const v = toPlanView(plan, 15*60); // 15:00 — утро уже позади
    const light = v.rows.find(r=>r.title.toLowerCase().includes("свет"))!;
    expect(light.past).toBe(true);
    expect(v.nextIdx).not.toBeNull();
    expect(v.rows[v.nextIdx!]!.past).toBe(false);
    // без времени — подсветки нет
    const v2 = toPlanView(plan);
    expect(v2.nextIdx).toBeNull();
    expect(v2.rows[0]!.past).toBeUndefined();
  });
  it("crunch bedtime shows +1 day formatting", () => {
    const plan = planDay({ profile, ctx:{ date:"2026-06-28", mode:"crunch", crunchUntilHM:"27:00", toggles:{} },
      lastNight:{ wokeHM:"07:00", bedHM:"23:00", quality:3 }, history:[] });
    const v = toPlanView(plan);
    const bed = v.rows.find(r=>r.title.toLowerCase().includes("спать"))!;
    expect(bed.time).toContain("ночью");
  });
});
