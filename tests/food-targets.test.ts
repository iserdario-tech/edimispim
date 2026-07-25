import { describe, it, expect } from "vitest";
import { computeTargets } from "../src/food/targets";
import { applySafety } from "../src/food/safety";

describe("computeTargets", () => {
  it("Mifflin-St Jeor + дефицит (мужчина)", () => {
    const t = computeTargets({ sex: "m", age: 30, heightCm: 180, weightKg: 90, goalWeightKg: 80, activity: "low" });
    // BMR = 10*90 + 6.25*180 - 5*30 + 5 = 1880; TDEE = 1880*1.2 = 2256
    expect(t.bmr).toBe(1880);
    expect(t.tdee).toBe(2256);
    expect(t.kcalTarget).toBe(1706);       // 2256 - 550
    expect(t.proteinGTarget).toBe(128);    // 1.6 * 80
    expect(t.fiberGTarget).toBe(30);
    expect(t.tempoKgPerWeek).toBeLessThanOrEqual(1);
  });

  it("белок берётся по текущему весу, если нет целевого", () => {
    const t = computeTargets({ sex: "f", age: 35, heightCm: 165, weightKg: 70, activity: "medium" });
    expect(t.proteinGTarget).toBe(112);    // 1.6 * 70
  });
});

describe("applySafety", () => {
  const base = { bmr: 1500, tdee: 1800, kcalTarget: 1150, proteinGTarget: 120, fiberGTarget: 30, tempoKgPerWeek: 0.5 };

  it("калораж поднимается до пола (женщина 1200)", () => {
    const r = applySafety(base, { sex: "f" }, {});
    expect(r.kcalTarget).toBe(1200);
    expect(r.flags).toContain("kcal_floored");
    expect(r.referDoctor).toBe(false);
  });

  it("флаг РПП (SCOFF>=2) → referDoctor + смягчение дефицита", () => {
    const r = applySafety({ ...base, kcalTarget: 1300 }, { sex: "m" }, { scoffScore: 2 });
    expect(r.referDoctor).toBe(true);
    expect(r.flags).toContain("screen_eating_disorder");
    expect(r.kcalTarget).toBeGreaterThanOrEqual(base.tdee - 300);
  });

  it("состояние из списка → referDoctor", () => {
    const r = applySafety(base, { sex: "m" }, { conditions: ["thyroid"] });
    expect(r.referDoctor).toBe(true);
    expect(r.flags).toContain("condition_thyroid");
  });

  // X21: синдром ночного питания виден только на стыке сна и еды
  it("флаг синдрома ночного питания смягчает дефицит и ведёт к специалисту", () => {
    const r = applySafety({ ...base, kcalTarget: 1300 }, { sex: "m" }, { nesFlagged: true });
    expect(r.referDoctor).toBe(true);
    expect(r.flags).toContain("screen_night_eating");
    expect(r.kcalTarget).toBeGreaterThanOrEqual(base.tdee - 300);
  });
});
