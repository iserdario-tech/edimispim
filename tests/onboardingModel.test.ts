import { describe, it, expect } from "vitest";
import { buildProfile } from "../src/ui/onboardingModel.js";
describe("onboardingModel", () => {
  it("derives targetSleep from wake-bed, clamped", () => {
    const p = buildProfile({ wakeHM:"07:00", bedHM:"23:00", chronotype:"intermediate",
      caffeineMg:200, caffeineRegular:true, napPossible:true });
    expect(p.anchorWakeHM).toBe("07:00");
    expect(p.targetSleepMin).toBe(480); // 8h
  });
  it("clamps absurd durations to bounds", () => {
    const p = buildProfile({ wakeHM:"07:00", bedHM:"06:00", chronotype:"late",
      caffeineMg:0, caffeineRegular:false, napPossible:false });
    expect(p.targetSleepMin).toBeLessThanOrEqual(540);
    expect(p.targetSleepMin).toBeGreaterThanOrEqual(420);
  });
});
