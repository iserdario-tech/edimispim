import { describe, it, expect } from "vitest";
import { explain, toSleepLogs } from "../src/explain";
import type { DayRecord } from "../src/day-log";

const TARGET = 465;   // 7:45

const night = (date: string, opts: { bed?: string; woke?: string; q?: 1 | 2 | 3 | 4 | 5; alcohol?: boolean } = {}): DayRecord => ({
  date,
  sleep: { wokeHM: opts.woke ?? "07:00", bedHM: opts.bed ?? "23:00", quality: opts.q ?? 4, alcohol: opts.alcohol },
});

describe("explain — приоритет правил", () => {
  it("красный флаг скрининга перебивает даже плохую ночь", () => {
    const today = night("2026-07-25", { bed: "03:00", q: 1 });
    const e = explain({ today, days: [today], targetSleepMin: TARGET, screenerFlagged: true });
    expect(e.kind).toBe("red_flag");
    expect(e.textRU).toMatch(/врачу/);
  });

  it("плохая ночь по длительности: объясняет аппетит и не обещает, что сон жжёт калории", () => {
    const today = night("2026-07-25", { bed: "02:30", woke: "07:00" });   // 4.5 ч
    const e = explain({ today, days: [today], targetSleepMin: TARGET, caffeineCutoffHM: "14:00" });
    expect(e.kind).toBe("rough_night");
    expect(e.textRU).toMatch(/тянуть на сладкое/);
    expect(e.textRU).toMatch(/не слабость характера/);
    expect(e.textRU).toMatch(/14:00/);
    expect(e.textRU).not.toMatch(/сжига|жжёт калори/i);
  });

  it("плохая ночь по качеству — даже если спал достаточно", () => {
    const today = night("2026-07-25", { bed: "22:00", woke: "07:00", q: 2 });
    expect(explain({ today, days: [today], targetSleepMin: TARGET }).kind).toBe("rough_night");
  });

  it("алкоголь: прайслист вечера, а не запрет", () => {
    const today = night("2026-07-25", { alcohol: true });
    const e = explain({ today, days: [today], targetSleepMin: TARGET });
    expect(e.kind).toBe("alcohol");
    expect(e.textRU).toMatch(/REM/);
    expect(e.textRU).not.toMatch(/нельзя|запрещ/i);
  });

  it("нормальная ночь без поводов — спокойный план", () => {
    const today = night("2026-07-25");
    expect(explain({ today, days: [today], targetSleepMin: TARGET }).kind).toBe("steady");
  });
});

describe("explain — правда про весы (главное сообщение продукта)", () => {
  // неделя недосыпа: ложится в 01:30, встаёт в 07:00 → около 5.5 ч при цели 7:45
  const roughWeek = (): DayRecord[] => {
    const days: DayRecord[] = [];
    for (let i = 0; i < 7; i++) {
      const date = `2026-07-${String(19 + i).padStart(2, "0")}`;
      days.push(night(date, { bed: "01:30", woke: "07:00", q: 3 }));
    }
    days[0]!.body = { weightKg: 88.0 };
    days[6]!.body = { weightKg: 87.1 };
    return days;
  };

  it("вес падает на фоне недосыпа → предупреждение о СОСТАВЕ потери", () => {
    const days = roughWeek();
    // сегодня ночь нормальная, чтобы не сработало правило 2
    days[6] = { ...days[6]!, sleep: { wokeHM: "07:00", bedHM: "23:00", quality: 4 } };
    const e = explain({ today: days[6]!, days, targetSleepMin: TARGET });
    expect(e.kind).toBe("scale_truth");
    expect(e.textRU).toMatch(/0\.9 кг/);
    expect(e.textRU).toMatch(/мышц/);
  });

  // Регресс: при хроническом недосыпе правило «плохая ночь» срабатывало каждый день
  // и человек никогда не узнавал главного — что теряет мышцы, а не жир.
  it("хронический недосып НЕ заглушает правду про весы, но план дня всё равно упомянут", () => {
    const days = roughWeek();                        // сегодня ночь тоже плохая
    const e = explain({ today: days[6]!, days, targetSleepMin: TARGET });
    expect(e.kind).toBe("scale_truth");
    expect(e.textRU).toMatch(/мышц/);
    expect(e.textRU).toMatch(/готовки меньше/);      // про упрощённый план не забыли
  });

  it("вес падает, но сон в порядке → не пугаем зря", () => {
    const days: DayRecord[] = [];
    for (let i = 0; i < 7; i++) {
      days.push(night(`2026-07-${String(19 + i).padStart(2, "0")}`, { bed: "23:00", woke: "07:00" }));
    }
    days[0]!.body = { weightKg: 88.0 };
    days[6]!.body = { weightKg: 87.1 };
    expect(explain({ today: days[6]!, days, targetSleepMin: TARGET }).kind).not.toBe("scale_truth");
  });

  it("вес растёт — правило про состав потери не применяется", () => {
    const days = roughWeek();
    days[0]!.body = { weightKg: 87.1 };
    days[6]!.body = { weightKg: 88.0 };
    days[6] = { ...days[6]!, sleep: { wokeHM: "07:00", bedHM: "23:00", quality: 4 } };
    expect(explain({ today: days[6]!, days, targetSleepMin: TARGET }).kind).not.toBe("scale_truth");
  });

  it("одного замера веса мало для заявления", () => {
    const days = roughWeek();
    delete days[0]!.body;
    days[6] = { ...days[6]!, sleep: { wokeHM: "07:00", bedHM: "23:00", quality: 4 } };
    expect(explain({ today: days[6]!, days, targetSleepMin: TARGET }).kind).not.toBe("scale_truth");
  });
});

describe("explain — якорь", () => {
  it("разболтанные подъёмы → говорим про регулярность", () => {
    const wakes = ["06:00", "09:30", "07:00", "10:30", "06:30", "11:00"];
    const days = wakes.map((w, i) => night(`2026-07-${String(20 + i).padStart(2, "0")}`, { woke: w, bed: "23:00", q: 4 }));
    const e = explain({ today: days[days.length - 1]!, days, targetSleepMin: TARGET });
    expect(e.kind).toBe("anchor");
    expect(e.textRU).toMatch(/выходн/);
  });
});

describe("toSleepLogs", () => {
  it("отбрасывает дни без сна и сохраняет алкоголь", () => {
    const days: DayRecord[] = [night("2026-07-01", { alcohol: true }), { date: "2026-07-02", body: { weightKg: 80 } }];
    const logs = toSleepLogs(days);
    expect(logs).toHaveLength(1);
    expect(logs[0]!.hadAlcohol).toBe(true);
  });
});
