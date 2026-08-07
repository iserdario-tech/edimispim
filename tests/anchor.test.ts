import { describe, it, expect } from "vitest";
import { anchor, midsleepMin, circularDiffMin } from "../src/anchor";
import type { DayRecord } from "../src/day-log";

const TARGET = 465;

// 2026-07-20 — понедельник, 25–26 июля — суббота и воскресенье
const night = (date: string, bedHM: string, wokeHM: string): DayRecord =>
  ({ date, sleep: { bedHM, wokeHM, quality: 4 } });

describe("midsleepMin", () => {
  it("отбой 23:00, подъём 07:00 → середина сна в 03:00", () => {
    expect(midsleepMin("23:00", "07:00", TARGET)).toBe(180);
  });

  it("отбой после полуночи считается верно", () => {
    // лёг 01:00, встал 09:00 → середина 05:00
    expect(midsleepMin("01:00", "09:00", TARGET)).toBe(300);
  });
});

describe("circularDiffMin", () => {
  it("23:50 и 00:30 отличаются на 40 минут, а не на 1400", () => {
    expect(circularDiffMin(23 * 60 + 50, 30)).toBe(40);
  });
  it("обычная разница внутри суток", () => {
    expect(circularDiffMin(180, 300)).toBe(120);
  });
  it("максимум — половина суток", () => {
    expect(circularDiffMin(0, 720)).toBe(720);
  });
});

describe("anchor", () => {
  const weekdays = ["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24"];
  const weekend = ["2026-07-25", "2026-07-26"];

  it("ровный режим: джетлаг близок к нулю", () => {
    const days = [...weekdays, ...weekend].map(d => night(d, "23:00", "07:00"));
    const a = anchor(days, TARGET);
    expect(a.socialJetlagMin).toBe(0);
    expect(a.verdictRU).toMatch(/ровный/);
  });

  it("выходные на два часа позже — джетлаг виден и назван честно", () => {
    const days = [
      ...weekdays.map(d => night(d, "23:00", "07:00")),
      ...weekend.map(d => night(d, "01:00", "09:00")),
    ];
    const a = anchor(days, TARGET);
    expect(a.socialJetlagMin).toBe(120);
    expect(a.verdictRU).toMatch(/перелёт/);
    // формулировка наблюдательная: «связан», а не «приводит»
    expect(a.verdictRU).toMatch(/связан/);
    expect(a.verdictRU).not.toMatch(/приводит к|вызывает/);
  });

  it("без выходных ночей джетлаг не выдумывается", () => {
    const a = anchor(weekdays.map(d => night(d, "23:00", "07:00")), TARGET);
    expect(a.socialJetlagMin).toBeNull();
    expect(a.verdictRU).toMatch(/выходные/i);
  });

  it("одной выходной ночи мало для заявления", () => {
    const days = [...weekdays.map(d => night(d, "23:00", "07:00")), night("2026-07-25", "01:00", "09:00")];
    expect(anchor(days, TARGET).socialJetlagMin).toBeNull();
  });

  it("пустая история не роняет расчёт", () => {
    const a = anchor([], TARGET);
    expect(a.socialJetlagMin).toBeNull();
    expect(a.regularity).toBeNull();   // нечего считать — и цифры нет
  });

  it("дни без отбоя игнорируются, а не считаются нулями", () => {
    const days: DayRecord[] = [
      ...weekdays.map(d => night(d, "23:00", "07:00")),
      ...weekend.map(d => night(d, "01:00", "09:00")),
      { date: "2026-07-27", sleep: { wokeHM: "07:00", quality: 3 } },   // отбоя нет
    ];
    expect(anchor(days, TARGET).socialJetlagMin).toBe(120);
  });
});

/**
 * Регресс: `regularityScore` считает МЕДИАННОЕ отклонение и устойчив к выбросам —
 * два выходных из семи не сдвигают медиану. Подъём на три часа позже по субботам
 * давал «100 из 100» прямо рядом с надписью «разъезд 2 часа»: две цифры на одном
 * экране противоречили друг другу.
 */
describe("единый показатель не противоречит сам себе", () => {
  const weekdays = ["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24"];
  const weekend = ["2026-07-25", "2026-07-26"];

  it("большой разъезд роняет общий балл, даже когда медиана подъёма ровная", () => {
    const days = [
      ...weekdays.map(d => night(d, "23:00", "07:00")),
      ...weekend.map(d => night(d, "02:30", "10:00")),
    ];
    const a = anchor(days, TARGET);
    expect(a.regularity).toBe(100);          // медиана устойчива — это не баг метрики
    expect(a.socialJetlagMin).toBeGreaterThanOrEqual(120);
    expect(a.score).toBeLessThan(50);        // но общий балл честно низкий
  });

  it("ровный режим даёт высокий балл", () => {
    const days = [...weekdays, ...weekend].map(d => night(d, "23:00", "07:00"));
    expect(anchor(days, TARGET).score).toBe(100);
  });

  it("без выходных балл равен ровности подъёма, а не выдумывается", () => {
    const a = anchor(weekdays.map(d => night(d, "23:00", "07:00")), TARGET);
    expect(a.score).toBe(a.regularity);
  });
});

/**
 * Найдено глазами на живом экране: новый человек, не отметивший ни одной ночи,
 * видел «Ровность режима 100 из 100». Приложение хвалило за режим, о котором
 * не знало ничего, — и обесценивало настоящие сто баллов у того, кто их заработал.
 */
describe("ровность режима не выдумывается", () => {
  it("без единой ночи цифры нет вовсе", () => {
    const a = anchor([], TARGET);
    expect(a.score).toBeNull();
    expect(a.verdictRU).toContain("Отметь ещё");
  });

  it("одной-двух ночей мало — цифры по-прежнему нет", () => {
    const a = anchor([night("2026-07-20", "23:00", "07:00"), night("2026-07-21", "23:10", "07:05")], TARGET);
    expect(a.score).toBeNull();
  });

  it("с четырёх ночей цифра появляется", () => {
    const a = anchor([
      night("2026-07-20", "23:00", "07:00"),
      night("2026-07-21", "23:10", "07:05"),
      night("2026-07-22", "23:05", "07:00"),
      night("2026-07-23", "23:00", "07:10"),
    ], TARGET);
    expect(a.score).not.toBeNull();
    expect(a.score!).toBeGreaterThan(80);
  });
});
