import { describe, it, expect } from "vitest";
import { nextStep } from "../src/next-step";
import type { DayRecord } from "../src/day-log";

const night = (date: string): DayRecord => ({ date, sleep: { wokeHM: "07:00", bedHM: "23:00", quality: 4 } });
// 20–24 июля 2026 — будни, 25–26 — выходные
const weekdays = ["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24"].map(night);
const weekend = ["2026-07-25", "2026-07-26"].map(night);

describe("nextStep — один шаг за раз, а не список задач", () => {
  it("нет настроек еды — сначала они", () => {
    expect(nextStep([], false).id).toBe("setup_food");
  });

  it("еда есть, ночей мало — просим отметить ночи и говорим зачем", () => {
    const s = nextStep([night("2026-07-20")], true);
    expect(s.id).toBe("log_nights");
    expect(s.done).toBe(1);
    expect(s.need).toBe(4);
    expect(s.whyRU).toMatch(/режим/);
  });

  it("будни есть, выходных нет — просим выходные", () => {
    expect(nextStep(weekdays, true).id).toBe("log_weekend");
  });

  it("ночи и выходные есть, веса нет — просим вес", () => {
    const s = nextStep([...weekdays, ...weekend], true);
    expect(s.id).toBe("add_weight");
    expect(s.whyRU).toMatch(/что именно уходит/);
  });

  it("всё собрано — не выдумываем новых заданий", () => {
    const days = [...weekdays, ...weekend];
    days[0] = { ...days[0]!, body: { weightKg: 88 } };
    days[6] = { ...days[6]!, body: { weightKg: 87 } };
    expect(nextStep(days, true).id).toBe("keep_going");
  });

  it("склонение не ломается ни на одном числе", () => {
    for (let n = 0; n < 4; n++) {
      const s = nextStep(Array.from({ length: n }, (_, i) => night(`2026-07-${20 + i}`)), true);
      expect(s.titleRU).not.toMatch(/ноч\s/);           // нет обрубка
      expect(s.titleRU).toMatch(/ноч(ь|и|ей)/);
    }
  });
});
