import { describe, it, expect } from "vitest";
import { healthFlags, healthSignature, healthCardLine, healthCardDue } from "../src/healthFlags";
import { stopBang } from "../src/screening";
import { answersFromResult } from "../src/screener";
import { runScreener } from "../src/screener";
import type { StopBangAnswers, NesAnswers } from "../src/screening";

const noSB: StopBangAnswers = { snoringLoud: false, tiredDaytime: false, observedApnea: false, highBloodPressure: false, neckOver40cm: false };
const noNes: NesAnswers = {
  eveningHyperphagia: false, nightEatingTwicePlus: false, morningAnorexia: false, urgeToEatBeforeSleep: false,
  insomnia: false, mustEatToSleep: false, eveningMoodDrop: false, distress: false,
};
const noScr = { loudSnoringWithPauses: false, daytimeSleepyDespiteEnoughSleep: false, legUrgeToMoveEvening: false, insomnia3xWeek3Months: false, lowMood2Weeks: false, selfHarmThoughts: false };
// мужчина 55 лет, 180 см, 120 кг — ИМТ 37: три балла STOP-Bang без единого вопроса
const bigMan = { sex: "m" as const, age: 55, heightCm: 180, weightKg: 120 };
const youngWoman = { sex: "f" as const, age: 30, heightCm: 168, weightKg: 60 };

describe("healthFlags", () => {
  it("ничего не отвечал — ничего не показываем", () => {
    expect(healthFlags({})).toEqual([]);
    expect(healthFlags({ screener: null, profile: bigMan })).toEqual([]);
  });

  it("без «да» про храп апноэ не выдумывается из пола, возраста и веса", () => {
    expect(healthFlags({ screening: { stopBang: noSB, nes: noNes }, profile: bigMan })).toEqual([]);
  });

  it("храп и остановки дыхания у мужчины 55 лет с ИМТ 37 — высокий риск, к сомнологу", () => {
    const f = healthFlags({ screening: { stopBang: { ...noSB, snoringLoud: true, observedApnea: true } }, profile: bigMan });
    expect(f).toHaveLength(1);
    expect(f[0]!.kind).toBe("apnea");
    expect(f[0]!.titleRU).toMatch(/апноэ/);
    expect(f[0]!.messageRU).toMatch(/врач/);
    expect(f[0]!.doctorRU).toMatch(/Сомнолог/);
  });

  it("ИМТ считается из роста и веса анкеты еды", () => {
    // храп + усталость + мужчина = 3 → средний; с ИМТ > 35 и возрастом > 50 — уже 5, высокий
    const light = healthFlags({ screening: { stopBang: { ...noSB, snoringLoud: true, tiredDaytime: true } }, profile: { ...bigMan, age: 40, weightKg: 80 } });
    const heavy = healthFlags({ screening: { stopBang: { ...noSB, snoringLoud: true, tiredDaytime: true } }, profile: bigMan });
    expect(light[0]!.titleRU).toBe("Есть признаки апноэ сна");
    expect(heavy[0]!.titleRU).toBe("Заметный риск апноэ сна");
  });

  it("один храп у молодой женщины — низкий риск, без карточки", () => {
    expect(healthFlags({ screening: { stopBang: { ...noSB, snoringLoud: true } }, profile: youngWoman })).toEqual([]);
  });

  it("без анкеты еды пол, возраст и ИМТ не засчитываются", () => {
    const f = healthFlags({ screening: { stopBang: { ...noSB, snoringLoud: true, observedApnea: true } } });
    expect(f).toEqual([]);   // 2 балла из 8 — низкий риск
  });

  it("паттерн ночного питания — отдельный пункт, к специалисту по пищевому поведению", () => {
    const nes: NesAnswers = { ...noNes, eveningHyperphagia: true, morningAnorexia: true, insomnia: true, mustEatToSleep: true, distress: true };
    const f = healthFlags({ screening: { nes }, profile: youngWoman });
    expect(f.map(x => x.kind)).toEqual(["night_eating"]);
    expect(f[0]!.doctorRU).toMatch(/пищев/);
  });

  it("общая анкета: каждый флаг со своим текстом, срочное первым", () => {
    const screener = runScreener({ ...noScr, legUrgeToMoveEvening: true, selfHarmThoughts: true });
    const f = healthFlags({ screener });
    expect(f.map(x => x.kind)).toEqual(["selfharm", "rls"]);
    expect(f[0]!.urgent).toBe(true);
    expect(f[1]!.messageRU).toMatch(/беспокойных ног/);
  });

  it("храп с паузами из общей анкеты не дублирует подробный вердикт про апноэ", () => {
    const screener = runScreener({ ...noScr, loudSnoringWithPauses: true, daytimeSleepyDespiteEnoughSleep: true });
    const both = healthFlags({ screener, screening: { stopBang: { ...noSB, snoringLoud: true, observedApnea: true } }, profile: bigMan });
    expect(both.map(x => x.kind)).toEqual(["apnea"]);
    const onlyScreener = healthFlags({ screener });
    expect(onlyScreener.map(x => x.kind)).toEqual(["osa"]);
  });

  it("тексты ведут к врачу и не ставят диагноз, без процентов и баллов", () => {
    const screener = runScreener({ ...noScr, loudSnoringWithPauses: true, daytimeSleepyDespiteEnoughSleep: true, insomnia3xWeek3Months: true, lowMood2Weeks: true });
    const nes: NesAnswers = { ...noNes, nightEatingTwicePlus: true, urgeToEatBeforeSleep: true, insomnia: true, eveningMoodDrop: true, distress: true };
    const all = [...healthFlags({ screener }), ...healthFlags({ screening: { stopBang: { ...noSB, snoringLoud: true, observedApnea: true, tiredDaytime: true }, nes }, profile: bigMan })];
    expect(all.length).toBeGreaterThanOrEqual(5);
    for (const f of all) {
      const text = `${f.titleRU} ${f.messageRU} ${f.doctorRU}`;
      expect(text).not.toMatch(/у (вас|тебя) (апноэ|синдром|бессонница)|диагноз:|\d+\s?%|балл/i);
      expect(f.doctorRU.length).toBeGreaterThan(0);
    }
  });

  it("подпись не меняется от веса и уровня риска, но меняется, когда появляется новый пункт", () => {
    const sb = { ...noSB, snoringLoud: true, tiredDaytime: true };
    const medium = healthFlags({ screening: { stopBang: sb }, profile: { ...bigMan, age: 40, weightKg: 80 } });
    const high = healthFlags({ screening: { stopBang: sb }, profile: bigMan });
    expect(medium[0]!.titleRU).not.toBe(high[0]!.titleRU);
    expect(healthSignature(medium)).toBe(healthSignature(high));      // похудел или поправился — карточка не выскакивает
    const plusRls = [...high, ...healthFlags({ screener: runScreener({ ...noScr, legUrgeToMoveEvening: true }) })];
    expect(healthSignature(plusRls)).not.toBe(healthSignature(high));
    expect(healthSignature([...plusRls].reverse())).toBe(healthSignature(plusRls));
    expect(healthSignature([])).toBe("");
  });

  it("флаг ночного питания из oheedet без ответов тоже попадает в список, свежие ответы важнее", () => {
    expect(healthFlags({ screen: { nesFlagged: true } }).map(f => f.kind)).toEqual(["night_eating"]);
    expect(healthFlags({ screen: { nesFlagged: true }, screening: { nes: noNes } })).toEqual([]);
  });

  it("SCOFF от двух «да» — пункт про отношения с едой: дефицит уже смягчён, человек должен знать почему", () => {
    expect(healthFlags({ screen: { scoffScore: 1 } })).toEqual([]);
    const f = healthFlags({ screen: { scoffScore: 2 } });
    expect(f.map(x => x.kind)).toEqual(["eating"]);
    expect(f[0]!.sensitive).toBe(true);
  });

  it("на главном экране чувствительное не называется, только счёт", () => {
    const flags = healthFlags({ screener: runScreener({ ...noScr, legUrgeToMoveEvening: true, lowMood2Weeks: true, selfHarmThoughts: true }) });
    const line = healthCardLine(flags);
    expect(line).toContain("Ноги по вечерам");
    expect(line).not.toMatch(/навредить|Настроение/);
    expect(line).toMatch(/ещё 2 пункта — внутри/);
    expect(healthCardLine(healthFlags({ screener: runScreener({ ...noScr, selfHarmThoughts: true }) }))).toBe("Подробности — внутри");
  });
});

describe("тексты про апноэ", () => {
  const sb = { ...noSB, snoringLoud: true, observedApnea: true, tiredDaytime: true };
  it("про вес говорим только при ИМТ от 30", () => {
    expect(stopBang(sb, { bmi: 24, age: 55, sex: "m" }).messageRU).not.toMatch(/вес/);
    expect(stopBang(sb, { bmi: 33, age: 55, sex: "m" }).messageRU).toMatch(/снижение веса/);
  });
  it("средний риск ведёт к врачу без условий «если…»", () => {
    const r = stopBang({ ...noSB, snoringLoud: true, tiredDaytime: true }, { bmi: 24, age: 40, sex: "m" });
    expect(r.levelRU).toBe("средний");
    expect(r.messageRU).toMatch(/проверить у врача/);
    expect(r.messageRU).not.toMatch(/^Если|— покажитесь/);
  });
});

describe("анкета в «Настройках сна» открывается с сохранёнными ответами", () => {
  it("ответы из результата дают тот же результат — сохранение ничего не стирает", () => {
    const keys = Object.keys(noScr) as (keyof typeof noScr)[];
    for (let mask = 0; mask < 1 << keys.length; mask++) {
      const a = Object.fromEntries(keys.map((k, i) => [k, !!(mask & (1 << i))])) as typeof noScr;
      const r = runScreener(a);
      expect(runScreener(answersFromResult(r)).flags).toEqual(r.flags);
    }
    expect(answersFromResult(null)).toEqual(noScr);
  });
});

describe("тексты общей проверки", () => {
  it("без диагнозов, значков и англоязычных сокращений", () => {
    const all = runScreener({ loudSnoringWithPauses: true, daytimeSleepyDespiteEnoughSleep: true, legUrgeToMoveEvening: true, insomnia3xWeek3Months: true, lowMood2Weeks: true, selfHarmThoughts: true });
    for (const m of all.messagesRU) expect(m).not.toMatch(/это (хроническая|апноэ|синдром)|≥|CBT|инсомни|\/нед|\/мес/i);
  });
});

describe("карточка на «Сутках»", () => {
  const apnea = healthFlags({ screening: { stopBang: { ...noSB, snoringLoud: true, observedApnea: true } }, profile: bigMan });
  const rls = healthFlags({ screener: runScreener({ ...noScr, legUrgeToMoveEvening: true }) });
  const urgent = healthFlags({ screener: runScreener({ ...noScr, selfHarmThoughts: true }) });
  const seenOf = (f: typeof apnea, at = "2026-10-10") => ({ sig: healthSignature(f), at });

  it("пусто — карточки нет; не закрывали — есть", () => {
    expect(healthCardDue([], null, "2026-10-10")).toBe(false);
    expect(healthCardDue(apnea, null, "2026-10-10")).toBe(true);
  });
  it("после «Понятно» не возвращается, пока не появился новый пункт", () => {
    const both = [...apnea, ...rls];
    expect(healthCardDue(both, seenOf(both), "2026-11-10")).toBe(false);
    expect(healthCardDue(rls, seenOf(both), "2026-11-10")).toBe(false);     // апноэ пропало — не повод
    expect(healthCardDue(both, seenOf(rls), "2026-10-11")).toBe(true);      // апноэ появилось — повод
  });
  it("срочное возвращается через неделю", () => {
    expect(healthCardDue(urgent, seenOf(urgent, "2026-10-10"), "2026-10-16")).toBe(false);
    expect(healthCardDue(urgent, seenOf(urgent, "2026-10-10"), "2026-10-17")).toBe(true);
  });
  it("при мыслях навредить себе есть номер, который работает везде", () => {
    expect(urgent[0]!.doctorRU).toMatch(/112/);
  });
  it("текст про ночную еду не приписывает рваный сон", () => {
    const f = healthFlags({ screen: { nesFlagged: true } });
    expect(f[0]!.messageRU).not.toMatch(/рван/);
  });
});
