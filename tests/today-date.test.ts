import { describe, it, expect } from "vitest";
import { localDateISO, localMinutes } from "../src/today-date";

/**
 * Регресс: приложение считало «сегодня» по UTC. У человека в UTC+3 в 01:30 ночи
 * это возвращало вчерашнее число — отметка о сне уходила не в тот день.
 */
describe("localDateISO", () => {
  it("за полночь по местному времени возвращает уже наступивший день", () => {
    // 01:30 в поясе UTC+3 — это 22:30 предыдущих суток по UTC
    const d = new Date("2026-07-26T01:30:00+03:00");
    const utcAnswer = d.toISOString().slice(0, 10);
    expect(utcAnswer).toBe("2026-07-25");            // как было — неверно
    // локальный ответ зависит от пояса машины: проверяем логику, а не конкретный пояс
    const expected = new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
    expect(localDateISO(d)).toBe(expected);
  });

  it("совпадает с локальным календарём в любой момент суток", () => {
    for (const hhmm of ["00:01", "03:00", "12:00", "23:59"]) {
      const d = new Date(`2026-03-15T${hhmm}:00`);   // локальное время машины
      const [y, m, day] = localDateISO(d).split("-").map(Number);
      expect(y).toBe(d.getFullYear());
      expect(m).toBe(d.getMonth() + 1);
      expect(day).toBe(d.getDate());
    }
  });

  it("формат всегда ГГГГ-ММ-ДД", () => {
    expect(localDateISO(new Date("2026-01-05T10:00:00"))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("localMinutes", () => {
  it("минуты считаются от местной полуночи", () => {
    const d = new Date("2026-07-26T07:30:00");
    expect(localMinutes(d)).toBe(7 * 60 + 30);
  });
});
