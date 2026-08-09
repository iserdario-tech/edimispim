import { describe, it, expect } from "vitest";
import { isValidTime, buildProfile } from "../src/ui/onboardingModel.js";
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

/**
 * `input type="time"` можно очистить, и тогда браузер отдаёт пустую строку.
 * `parseHM` на ней бросает исключение — то есть человек, стерший время подъёма,
 * получал по кнопке «Построить план» белый экран вместо плана.
 */
describe("битое время не роняет приложение", () => {
  it("пустое время распознаётся как негодное", () => {
    expect(isValidTime("")).toBe(false);
    expect(isValidTime("25:99")).toBe(false);
    expect(isValidTime("07:00")).toBe(true);
  });

  it("профиль собирается даже из пустых полей", () => {
    const p = buildProfile({
      wakeHM: "", bedHM: "", chronotype: "intermediate",
      caffeineMg: 95, caffeineRegular: true, napPossible: true,
    });
    expect(p.anchorWakeHM).toBe("07:00");
    expect(p.targetSleepMin).toBeGreaterThanOrEqual(420);
  });
});
