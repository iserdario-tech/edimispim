import { describe, it, expect } from "vitest";
import { stopBang, nightEating, type NesAnswers, type StopBangAnswers } from "../src/screening";
import { applySafety } from "../src/food/safety";

const noStopBang: StopBangAnswers = {
  snoringLoud: false, tiredDaytime: false, observedApnea: false,
  highBloodPressure: false, neckOver40cm: false,
};
const lowRiskCtx = { bmi: 24, age: 30, sex: "f" as const };

describe("STOP-Bang", () => {
  it("нет признаков — низкий риск, ничего не показываем", () => {
    const r = stopBang(noStopBang, lowRiskCtx);
    expect(r.flagged).toBe(false);
    expect(r.score).toBe(0);
    expect(r.messageRU).toBe("");
  });

  it("три признака — средний риск", () => {
    const r = stopBang({ ...noStopBang, snoringLoud: true, tiredDaytime: true, observedApnea: true }, lowRiskCtx);
    expect(r.score).toBe(3);
    expect(r.flagged).toBe(true);
    expect(r.levelRU).toBe("средний");
  });

  it("ИМТ, возраст и пол считаются из профиля, а не спрашиваются", () => {
    const r = stopBang(noStopBang, { bmi: 38, age: 55, sex: "m" });
    expect(r.score).toBe(3);           // B + A + G без единого вопроса
  });

  it("пять признаков — высокий риск, говорим про связь веса и апноэ", () => {
    const r = stopBang(
      { ...noStopBang, snoringLoud: true, observedApnea: true, tiredDaytime: true },
      { bmi: 38, age: 55, sex: "m" },
    );
    expect(r.score).toBe(6);
    expect(r.levelRU).toBe("высокий");
    expect(r.messageRU).toMatch(/врач/);
  });

  it("скрининг не утверждает наличие болезни, а ведёт к врачу", () => {
    const r = stopBang({ ...noStopBang, snoringLoud: true, observedApnea: true }, { bmi: 38, age: 55, sex: "m" });
    expect(r.messageRU).not.toMatch(/у вас апноэ|это апноэ|диагноз:/i);
    expect(r.messageRU).toMatch(/не ставит диагнозов/);
  });
});

const noNes: NesAnswers = {
  eveningHyperphagia: false, nightEatingTwicePlus: false, morningAnorexia: false,
  urgeToEatBeforeSleep: false, insomnia: false, mustEatToSleep: false,
  eveningMoodDrop: false, distress: false,
};

describe("Синдром ночного питания", () => {
  it("полный паттерн — флаг", () => {
    const r = nightEating({
      ...noNes, eveningHyperphagia: true, morningAnorexia: true,
      insomnia: true, mustEatToSleep: true, distress: true,
    });
    expect(r.flagged).toBe(true);
    expect(r.messageRU).toMatch(/специалист/);
  });

  it("без основного признака флага нет, сколько бы ни было сопутствующих", () => {
    const r = nightEating({
      ...noNes, morningAnorexia: true, insomnia: true,
      mustEatToSleep: true, eveningMoodDrop: true, urgeToEatBeforeSleep: true, distress: true,
    });
    expect(r.flagged).toBe(false);
  });

  it("без дистресса флага нет — это критерий, а не формальность", () => {
    const r = nightEating({
      ...noNes, nightEatingTwicePlus: true, morningAnorexia: true,
      insomnia: true, mustEatToSleep: true, distress: false,
    });
    expect(r.flagged).toBe(false);
  });

  it("меньше трёх сопутствующих — флага нет", () => {
    const r = nightEating({ ...noNes, eveningHyperphagia: true, insomnia: true, distress: true });
    expect(r.flagged).toBe(false);
  });

  it("флаг реально смягчает цель по калориям, а не просто печатает текст", () => {
    const base = { bmr: 1500, tdee: 1800, kcalTarget: 1150, proteinGTarget: 120, fiberGTarget: 30, tempoKgPerWeek: 0.5 };
    const flagged = nightEating({
      ...noNes, eveningHyperphagia: true, morningAnorexia: true,
      insomnia: true, mustEatToSleep: true, distress: true,
    }).flagged;
    const safe = applySafety(base, { sex: "m" }, { nesFlagged: flagged });
    expect(safe.kcalTarget).toBeGreaterThanOrEqual(base.tdee - 300);
    expect(safe.referDoctor).toBe(true);
  });
});
