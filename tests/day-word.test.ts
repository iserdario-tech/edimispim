import { describe, it, expect } from "vitest";
import { dayWord, type DayWordInput } from "../src/dayWord";

const hm = (h: number, m = 0) => h * 60 + m;
const base: DayWordInput = {
  nowMin: hm(12, 20), logged: true, rough: false, mode: "normal", cheat: false,
  dinnerMin: hm(20, 30), dinnerMarked: false, bedMin: hm(23, 30), wokeHM: "07:10",
};

describe("слово дня", () => {
  it("утро до отметки ночи", () => {
    expect(dayWord({ ...base, nowMin: hm(7, 15), logged: false }))
      .toEqual({ word: "Доброе утро", sub: "встал в 07:10", phase: "morning" });
  });
  it("после плохой ночи — лёгкий день с длительностью сна", () => {
    expect(dayWord({ ...base, rough: true, sleptMin: 340 }))
      .toEqual({ word: "Лёгкий день", sub: "ночь 5 ч 40 · план проще, калории те же", phase: "day" });
  });
  it("плохая ночь без известного отбоя — без цифры", () => {
    expect(dayWord({ ...base, rough: true }).sub).toBe("ночь была плохой · план проще, калории те же");
  });
  it("после времени ужина, до отбоя меньше 3 часов — пора закругляться", () => {
    expect(dayWord({ ...base, nowMin: hm(21, 40) }))
      .toEqual({ word: "Пора закругляться", sub: "спать в 23:30 · через 1 ч 50", phase: "evening" });
  });
  it("ужин отмечен раньше времени — тоже вечер, если отбой близко", () => {
    expect(dayWord({ ...base, nowMin: hm(20, 40), dinnerMarked: true, dinnerMin: hm(21) }).phase).toBe("evening");
  });
  it("после полуночи — уже пора спать", () => {
    expect(dayWord({ ...base, nowMin: hm(0, 35) }))
      .toEqual({ word: "Пора закругляться", sub: "спать в 23:30 · уже пора", phase: "evening" });
  });
  it("вечер сильнее «лёгкого дня»", () => {
    expect(dayWord({ ...base, nowMin: hm(21, 40), rough: true }).word).toBe("Пора закругляться");
  });
  it("свободный день сильнее всего", () => {
    expect(dayWord({ ...base, nowMin: hm(21, 40), cheat: true, rough: true }))
      .toEqual({ word: "Ем без плана", sub: "меню и счёт калорий сегодня выключены", phase: "day" });
  });
  it("допоздна и отсыпаюсь", () => {
    expect(dayWord({ ...base, mode: "crunch" }).word).toBe("Долгий день");
    expect(dayWord({ ...base, mode: "recovery" }).word).toBe("День отдыха");
  });
  it("иначе — обычный день, подзаголовок даёт экран", () => {
    expect(dayWord(base)).toEqual({ word: "Обычный день", sub: "", phase: "day" });
  });
  it("утро с отмеченной ночью — уже не «доброе утро», а слово дня", () => {
    expect(dayWord({ ...base, nowMin: hm(8), logged: true }).word).toBe("Обычный день");
  });
});
