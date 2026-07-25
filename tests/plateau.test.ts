import { describe, it, expect } from "vitest";
import { plateau } from "../src/plateau";
import type { DayRecord } from "../src/day-log";

const TARGET = 465;

/** Строит период: n дней подряд с заданным сном и отметками еды. */
function period(opts: { days: number; bedHM: string; followed: boolean; startKg: number; endKg: number }): DayRecord[] {
  const out: DayRecord[] = [];
  for (let i = 0; i < opts.days; i++) {
    const date = new Date(Date.parse("2026-07-01") + i * 86_400_000).toISOString().slice(0, 10);
    out.push({
      date,
      sleep: { wokeHM: "07:00", bedHM: opts.bedHM, quality: 3 },
      food: { followed: opts.followed },
    });
  }
  out[0]!.body = { weightKg: opts.startKg };
  out[Math.floor(opts.days / 2)]!.body = { weightKg: (opts.startKg + opts.endKg) / 2 };
  out[opts.days - 1]!.body = { weightKg: opts.endKg };
  return out;
}

describe("plateau — отвечает «почему вес встал» по двум рядам сразу", () => {
  it("мало данных — молчим, а не выдумываем вердикт", () => {
    expect(plateau([], TARGET).cause).toBe("no_data");
    expect(plateau(period({ days: 5, bedHM: "23:00", followed: true, startKg: 88, endKg: 88 }), TARGET).cause).toBe("no_data");
  });

  it("вес идёт вниз — это не плато", () => {
    const days = period({ days: 21, bedHM: "23:00", followed: true, startKg: 88, endKg: 86.5 });
    expect(plateau(days, TARGET).cause).toBe("not_plateau");
    expect(plateau(days, TARGET).messageRU).toBe("");
  });

  it("сон течёт, еда по плану → указывает на сон", () => {
    const days = period({ days: 21, bedHM: "02:00", followed: true, startKg: 88, endKg: 88 });
    const r = plateau(days, TARGET);
    expect(r.cause).toBe("sleep");
    expect(r.messageRU).toMatch(/сна|сон/);
  });

  it("сон в порядке, еда мимо → указывает на еду", () => {
    const days = period({ days: 21, bedHM: "23:00", followed: false, startKg: 88, endKg: 88 });
    const r = plateau(days, TARGET);
    expect(r.cause).toBe("food");
    expect(r.messageRU).toMatch(/план/);
  });

  it("течёт и то и другое → советует начать со сна", () => {
    const days = period({ days: 21, bedHM: "02:00", followed: false, startKg: 88, endKg: 88 });
    const r = plateau(days, TARGET);
    expect(r.cause).toBe("both");
    expect(r.messageRU).toMatch(/со сна/);
  });

  it("оба ряда ровные → честно говорит подождать, а не ищет виноватого", () => {
    const days = period({ days: 21, bedHM: "23:00", followed: true, startKg: 88, endKg: 88 });
    const r = plateau(days, TARGET);
    expect(r.cause).toBe("keep_waiting");
    expect(r.messageRU).toMatch(/вода|Ничего не меняй/i);
  });

  it("вердикт не выдаёт себя за статистику: без процентов и p-значений", () => {
    const days = period({ days: 21, bedHM: "02:00", followed: false, startKg: 88, endKg: 88 });
    const m = plateau(days, TARGET).messageRU;
    expect(m).not.toMatch(/p\s*[=<]|корреляц|%/i);
  });

  it("склонение недель не ломается", () => {
    for (const d of [14, 21, 35, 42]) {
      const m = plateau(period({ days: d, bedHM: "23:00", followed: true, startKg: 88, endKg: 88 }), TARGET).messageRU;
      expect(m).toMatch(/недел(ю|и|ь)/);
    }
  });
});
