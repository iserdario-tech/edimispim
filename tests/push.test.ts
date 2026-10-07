import { describe, it, expect } from "vitest";
import { planDay, parseHM } from "../src/index.js";
import { planPushes, mealPushes, checkinDue } from "../src/push.js";
const profile = { anchorWakeHM:"07:00", targetSleepMin:465, chronotype:"intermediate",
  caffeine:{ typicalMgPerDose:95, regularUser:true }, napPossibleByDefault:true, goal:"alertness" } as const;
const plan = planDay({ profile, ctx:{ date:"2026-07-10", mode:"normal", toggles:{} },
  lastNight:{ wokeHM:"07:00", quality:3 }, history:[] });

const at = (kind: string) => plan.windows.find(w => w.kind === kind)!.startMin;
const kinds = (now: number, prefs?: any) => planPushes(plan.windows, now, 5, prefs).map(p => p.kind);

describe("пуши плана — заранее, а не в момент события", () => {
  it("утренний свет — в момент подъёма", () => {
    expect(kinds(7 * 60)).toContain("morning_light");
    expect(kinds(9 * 60)).not.toContain("morning_light");
  });
  it("последний кофе — за 30 минут, с временем в заголовке", () => {
    const c = at("caffeine_last");
    const p = planPushes(plan.windows, c - 30, 5).find(p => p.kind === "caffeine_last")!;
    expect(p.title).toMatch(/^Последний кофе — до \d\d:\d\d$/);
    expect(kinds(c)).not.toContain("caffeine_last");
  });
  it("отбой — за час", () => {
    const b = at("target_bed") % 1440;
    expect(planPushes(plan.windows, b - 60, 5).find(p => p.kind === "target_bed")!.title).toBe("Через час — спать");
    expect(kinds(b)).not.toContain("target_bed");
  });
  it("не шлём окна вне списка (дневная вялость)", () => {
    expect(kinds(at("afternoon_dip") % 1440)).not.toContain("afternoon_dip");
  });
  it("выключенная группа не шлётся", () => {
    expect(kinds(at("caffeine_last") - 30, { food: true, caffeine: false, sleep: true })).not.toContain("caffeine_last");
    expect(kinds(7 * 60, { food: true, caffeine: true, sleep: false })).not.toContain("morning_light");
  });
});

describe("пуши еды — с учётом времени готовки", () => {
  const wake = parseHM("07:00");
  const meal = (slot: string, hm: string, cookMin: number, extra = {}) => ({ slot, timeMin: parseHM(hm), name: "Рагу", cookMin, ...extra });
  it("долгая готовка: время готовки + 10 минут дойти до кухни", () => {
    const p = mealPushes([meal("dinner", "20:00", 30)], parseHM("19:20"), 5, wake);
    expect(p).toEqual([{ kind: "meal:dinner", title: "Пора готовить ужин", body: "Рагу — 30 мин, к 20:00" }]);
  });
  it("быстрое блюдо — за 15 минут", () => {
    expect(mealPushes([meal("lunch", "13:00", 10)], parseHM("12:45"), 5, wake)[0]!.title).toBe("Через 15 мин — обед");
  });
  it("остатки — разогреть, а не готовить", () => {
    expect(mealPushes([meal("lunch", "13:00", 60, { leftover: true })], parseHM("12:45"), 5, wake)[0]!.body).toBe("Уже готово, разогрей: Рагу");
  });
  it("перекусы и сладкое не беспокоим", () => {
    expect(mealPushes([meal("snack", "16:00", 0), meal("dessert", "17:00", 0)], parseHM("15:45"), 5, wake)).toEqual([]);
    expect(mealPushes([meal("snack", "16:00", 0), meal("dessert", "17:00", 0)], parseHM("16:45"), 5, wake)).toEqual([]);
  });
  it("готовка завтрака не будит раньше подъёма", () => {
    expect(mealPushes([meal("breakfast", "07:30", 25)], parseHM("07:00"), 5, wake)[0]!.title).toBe("Пора готовить завтрак");
    expect(mealPushes([meal("breakfast", "07:30", 25)], parseHM("06:55"), 5, wake)).toEqual([]);
  });
});

// Worker строит план по контексту дня из приложения (s.day). Если контекст игнорировать,
// пуши приходят по «обычному дню», хотя на экране у человека другой план.
describe("контекст дня меняет пуш-окна", () => {
  const mk = (ctx: any) => planDay({ profile, ctx, lastNight:{ wokeHM: profile.anchorWakeHM, quality:3 }, history:[] });
  const bed = (p: any) => p.windows.find((w: any) => w.kind === "target_bed")!.startMin;

  it("режим «работаю допоздна» сдвигает отбой против обычного дня", () => {
    const normal = mk({ date:"2026-07-24", mode:"normal", toggles:{} });
    const crunch = mk({ date:"2026-07-24", mode:"crunch", crunchUntilHM:"27:00", toggles:{} });
    expect(bed(crunch)).not.toBe(bed(normal));
  });
  it("«нельзя вздремнуть» заменяет совет спать на альтернативу", () => {
    const noNap = mk({ date:"2026-07-24", mode:"normal", toggles:{ napUnavailable:true } });
    const w = noNap.windows.find(w=>w.kind==="nap")!;
    expect(w.title).toBe("Вместо дневного сна");        // не зовём спать
    expect(w.detail).not.toMatch(/Поспи|будильник/);
  });
});

describe("checkinDue (утренняя отметка)", () => {
  const wake = parseHM("07:00"); // отметка в 07:45
  it("fires in the 5-min slot at 07:45", () => {
    expect(checkinDue(7*60+45, wake)).toBe(true);
    expect(checkinDue(7*60+41, wake)).toBe(true);
  });
  it("does not fire before or after the slot", () => {
    expect(checkinDue(7*60+40, wake)).toBe(false); // ещё рано
    expect(checkinDue(7*60+46, wake)).toBe(false); // уже поздно
    expect(checkinDue(9*60, wake)).toBe(false);
  });
  it("wraps past midnight (wake 23:30 -> checkin 00:15)", () => {
    expect(checkinDue(15, parseHM("23:30"))).toBe(true);
  });
});
