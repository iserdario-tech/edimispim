import { describe, it, expect } from "vitest";
import { planDay, parseHM } from "../src/index.js";
import { dueWindows, checkinDue } from "../src/push.js";
const profile = { anchorWakeHM:"07:00", targetSleepMin:465, chronotype:"intermediate",
  caffeine:{ typicalMgPerDose:95, regularUser:true }, napPossibleByDefault:true, goal:"alertness" } as const;
const plan = planDay({ profile, ctx:{ date:"2026-07-10", mode:"normal", toggles:{} },
  lastNight:{ wokeHM:"07:00", quality:3 }, history:[] });

describe("dueWindows", () => {
  it("fires morning_light at 07:00 within slot", () => {
    const due = dueWindows(plan.windows, 7*60, 5); // 07:00
    expect(due.some(w=>w.kind==="morning_light")).toBe(true);
  });
  it("does not fire it at 09:00", () => {
    const due = dueWindows(plan.windows, 9*60, 5);
    expect(due.some(w=>w.kind==="morning_light")).toBe(false);
  });
  it("ignores non-allowlisted windows (afternoon_dip)", () => {
    const dip = plan.windows.find(w=>w.kind==="afternoon_dip")!;
    const due = dueWindows(plan.windows, dip.startMin % 1440, 5);
    expect(due.some(w=>w.kind==="afternoon_dip")).toBe(false);
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
