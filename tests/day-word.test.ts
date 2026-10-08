import { describe, it, expect } from "vitest";
import { dayWord, type DayWordInput } from "../src/dayWord";

const hm = (h: number, m = 0) => h * 60 + m;
const meal = (slot: string, t: number, marked = false) => ({ slot, timeMin: t, marked });
const DAY = [meal("breakfast", hm(8)), meal("lunch", hm(13, 30)), meal("dessert", hm(17)), meal("dinner", hm(20, 30))];
const base: DayWordInput = {
  nowMin: hm(12, 20), logged: true, rough: false, mode: "normal", cheat: false,
  meals: DAY, bedMin: hm(23, 30), wokeHM: "07:10",
};
const done = (...slots: string[]) => DAY.map(m => ({ ...m, marked: slots.includes(m.slot) }));

describe("слово дня — от того, что осталось", () => {
  it("утро до отметки ночи", () => {
    expect(dayWord({ ...base, nowMin: hm(7, 15), logged: false }))
      .toEqual({ word: "Доброе утро", sub: "встал в 07:10", phase: "morning" });
  });
  it("днём — что дальше и сколько осталось", () => {
    expect(dayWord({ ...base, meals: done("breakfast") }))
      .toEqual({ word: "Дальше обед", sub: "в 13:30 · осталось 3 приёма", phase: "day" });
  });
  it("время приёма прошло, отметки нет — он ждёт", () => {
    expect(dayWord({ ...base, nowMin: hm(14), meals: done("breakfast") }))
      .toEqual({ word: "Обед ждёт", sub: "был в 13:30 · отметь или замени", phase: "day" });
  });
  it("давно пропущенный приём не держит заголовок: дальше — следующий", () => {
    expect(dayWord({ ...base, nowMin: hm(16), meals: done("breakfast") }).word).toBe("Дальше сладкое");
  });
  it("вечером с неотмеченным ужином — «Остался ужин», а не «пора закругляться»", () => {
    expect(dayWord({ ...base, nowMin: hm(21, 40), meals: [...done("breakfast", "lunch", "dessert").slice(0, 3), meal("dinner", hm(22))] }))
      .toEqual({ word: "Остался ужин", sub: "в 22:00 · спать в 23:30 · через\u00a01\u00a0ч\u00a050", phase: "evening" });
  });
  it("вечером два приёма впереди — «Ещё 2 приёма»", () => {
    expect(dayWord({ ...base, nowMin: hm(20, 45), meals: [...done("breakfast", "lunch").slice(0, 2), meal("dinner", hm(21)), meal("dessert", hm(22))] }).word)
      .toBe("Ещё 2 приёма");
  });
  it("всё съедено, до отбоя больше часа — вечер свободен; меньше часа — пора закругляться", () => {
    expect(dayWord({ ...base, nowMin: hm(21), meals: done("breakfast", "lunch", "dessert", "dinner") }))
      .toEqual({ word: "Вечер свободен", sub: "спать в 23:30 · через\u00a02\u00a0ч\u00a030", phase: "evening" });
    expect(dayWord({ ...base, nowMin: hm(22, 50), meals: done("breakfast", "lunch", "dessert", "dinner") }).word).toBe("Пора закругляться");
  });
  it("всё съедено днём — еда на сегодня всё", () => {
    expect(dayWord({ ...base, nowMin: hm(18), meals: done("breakfast", "lunch", "dessert", "dinner") }).word).toBe("Еда на сегодня всё");
  });
  it("после отбоя — пора спать, что бы ни осталось", () => {
    expect(dayWord({ ...base, nowMin: hm(0, 35) }))
      .toEqual({ word: "Пора спать", sub: "спать в 23:30 · уже пора", phase: "evening" });
  });
  it("после плохой ночи — лёгкий день с длительностью сна и следующим приёмом", () => {
    expect(dayWord({ ...base, rough: true, sleptMin: 340, meals: done("breakfast") }))
      .toEqual({ word: "Лёгкий день", sub: "ночь 5\u00a0ч\u00a040 · план проще · обед в 13:30", phase: "day" });
  });
  it("плохая ночь без известного отбоя и без еды — без цифры", () => {
    expect(dayWord({ ...base, rough: true, meals: [] }).sub).toBe("ночь была плохой · план проще, калории те же");
  });
  it("свободный день сильнее всего", () => {
    expect(dayWord({ ...base, nowMin: hm(21, 40), cheat: true, rough: true }))
      .toEqual({ word: "Ем без плана", sub: "меню и счёт калорий сегодня выключены", phase: "day" });
  });
  it("допоздна и отсыпаюсь", () => {
    expect(dayWord({ ...base, mode: "crunch", meals: [] }).word).toBe("Долгий день");
    expect(dayWord({ ...base, mode: "recovery", meals: [] }).word).toBe("День отдыха");
  });
  it("еда не настроена — обычный день", () => {
    expect(dayWord({ ...base, meals: [] })).toEqual({ word: "Обычный день", sub: "", phase: "day" });
  });
});
