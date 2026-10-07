import { describe, it, expect } from "vitest";
import { expenditure } from "../src/expenditure";
import { plateau } from "../src/plateau";
import { targetsFor, type FoodSettings } from "../src/ui/storage";
import { targetsForToday } from "../src/food/index";
import { toDayRecords } from "../src/ui/dayRecords";
import type { DayEaten } from "../src/food/eaten";
import type { DayLog } from "../src/index";

/**
 * «8–12 недель жизни»: выдуманный человек живёт день за днём — ест по плану (или нет),
 * вес меняется по его НАСТОЯЩЕМУ расходу плюс шум воды, он взвешивается, а приложение
 * каждый вечер считает реальный расход и, если пора, предлагает поправку — человек соглашается.
 * Проверяем петлю целиком: что подсказки приходят тогда, когда должны, и туда, куда должны.
 */
const START = "2026-10-07";
const iso = (n: number) => new Date(Date.parse(START + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
const noise = (n: number) => Math.sin(n * 12.9898) * 0.35;   // вода и соль, ±0.35 кг
const ALL_ATE = { breakfast: "ate", lunch: "ate", dessert: "ate", dinner: "ate" } as const;

const FOOD = {
  profile: { sex: "m", age: 33, heightCm: 180, weightKg: 92, goalWeightKg: 82, activity: "low" },
  constraints: { allergens: [], cookware: ["stove", "oven", "microwave"], budget: "medium", cuisines: [], dislikes: [] },
  mealCount: 4, pace: "normal", startISO: START, tuned: true,
} as unknown as FoodSettings;

interface Person {
  /** Насколько настоящий расход отличается от формулы, ккал в день. */
  tdeeShift: number;
  days?: number;
  logged?: (n: number) => boolean;
  weighed?: (n: number) => boolean;
  /** Соглашается ли на предложенную поправку. */
  accept?: boolean;
  /** Сколько дней «до старта»: вес скачет, записи редкие — мусор, который не должен влиять. */
  junkBefore?: number;
}

function live(p: Person) {
  let food = FOOD;
  let kg = 92;
  const weights: { date: string; kg: number }[] = [];
  const eaten: Record<string, DayEaten> = {};
  const history: DayLog[] = [];
  const adjustments: { day: number; step: number }[] = [];
  const statuses: string[] = [];
  for (let n = -(p.junkBefore ?? 0); n < 0; n++) {
    weights.push({ date: iso(n), kg: +(96 + Math.sin(n) * 2).toFixed(1) });
    if (n % 3 === 0) eaten[iso(n)] = { planned: 4, marks: { breakfast: "own" }, dayKcal: 2600 };
  }
  for (let n = 0; n < (p.days ?? 84); n++) {
    const date = iso(n);
    const target = targetsForToday(targetsFor(food), food.startISO, date, food.pace).targets.kcalTarget;
    const trueTdee = targetsFor({ ...food, kcalAdjust: 0, profile: { ...food.profile, weightKg: kg } }).tdee + p.tdeeShift;
    kg += (target - trueTdee) / 7700;                // ест ровно план — разница уходит в вес
    history.push({ date, wokeHM: "07:00", bedHM: "23:00", quality: 3 } as DayLog);
    if (p.logged?.(n) ?? true) eaten[date] = { planned: 4, marks: { ...ALL_ATE }, dayKcal: target };
    if (p.weighed?.(n) ?? true) {
      const w = +(kg + noise(n)).toFixed(1);
      weights.push({ date, kg: w });
      food = { ...food, profile: { ...food.profile, weightKg: w } };   // как addWeight в приложении
    }
    const r = expenditure({
      today: date, startISO: food.startISO, weights, eaten, mealCount: 4,
      targetOf: () => target, currentTarget: target, ...(food.kcalAdjustAt ? { lastAdjustISO: food.kcalAdjustAt } : {}),
    });
    statuses.push(r.status);
    if ((p.accept ?? true) && r.status === "ready" && r.step !== 0 && r.nextChangeInDays === 0) {
      adjustments.push({ day: n, step: r.step });
      food = { ...food, kcalAdjust: (food.kcalAdjust ?? 0) + r.step, kcalAdjustAt: date };
    }
  }
  const lossPerWeek = (from: number) => {
    const ws = weights.filter(w => w.date >= iso(from));
    return ((ws[0]!.kg - ws.at(-1)!.kg) / (ws.length - 1)) * 7;
  };
  return { adjustments, statuses, food, weights, eaten, history, kg, lossPerWeek };
}

describe("8–12 недель жизни: петля «вес → расход → поправка»", () => {
  it("тратит на 300 ккал меньше формулы — через 4 недели урезать, потом не чаще раза в 2 недели, и темп выходит на план", () => {
    const s = live({ tdeeShift: -300 });
    expect(s.adjustments.length).toBeGreaterThan(0);
    expect(s.adjustments[0]!.day).toBeGreaterThanOrEqual(28);
    expect(s.adjustments[0]!.step).toBeLessThan(0);
    for (let i = 1; i < s.adjustments.length; i++) expect(s.adjustments[i]!.day - s.adjustments[i - 1]!.day).toBeGreaterThanOrEqual(14);
    const total = s.adjustments.reduce((a, x) => a + x.step, 0);
    expect(total).toBeGreaterThanOrEqual(-450);
    expect(total).toBeLessThanOrEqual(-150);
    expect(s.lossPerWeek(63)).toBeGreaterThan(0.3);   // последние 3 недели — близко к плану 0.5
  });

  it("формула угадала — норму почти не трогает", () => {
    const s = live({ tdeeShift: 0 });
    expect(Math.abs(s.adjustments.reduce((a, x) => a + x.step, 0))).toBeLessThanOrEqual(150);
  });

  it("тратит на 400 больше — худеет слишком быстро, приложение предлагает добавить", () => {
    const s = live({ tdeeShift: 400 });
    expect(s.adjustments[0]?.step).toBeGreaterThan(0);
  });

  it("записывает еду 3 дня из 7 — оценки нет, норму не трогает", () => {
    const s = live({ tdeeShift: -300, logged: n => n % 7 < 3 });
    expect(s.statuses).not.toContain("ready");
    expect(s.adjustments).toEqual([]);
  });

  it("взвешивается раз в неделю — оценки нет, норму не трогает", () => {
    const s = live({ tdeeShift: -300, weighed: n => n % 7 === 0 });
    expect(s.adjustments).toEqual([]);
  });

  it("старые записи до «Начинаю с сегодня» не влияют: поправки те же, что при чистом старте", () => {
    const clean = live({ tdeeShift: -300 });
    const dirty = live({ tdeeShift: -300, junkBefore: 45 });
    expect(dirty.adjustments).toEqual(clean.adjustments);
    expect(dirty.adjustments[0]!.day).toBeGreaterThanOrEqual(28);
  });

  it("ест на поддержке и отказывается от поправок — плато видно, и ответ «сон и еда в порядке, подожди»", () => {
    const s = live({ tdeeShift: -550, accept: false, days: 56 });
    const r = plateau(toDayRecords(s.history, s.weights, s.eaten), 480, START);
    expect(["keep_waiting", "food", "sleep", "both"]).toContain(r.cause);
    expect(r.weeks).toBeGreaterThanOrEqual(3);
  });

  it("минус 4 кг за 6 недель, потом 3 недели на месте — это плато (раньше сравнивался первый вес с последним)", () => {
    const history: DayLog[] = [], weights: { date: string; kg: number }[] = [];
    for (let n = 0; n < 63; n++) {
      history.push({ date: iso(n), wokeHM: "07:00", bedHM: "23:00", quality: 3 } as DayLog);
      const kg = n < 42 ? 92 - n * 0.095 : 92 - 41 * 0.095;
      weights.push({ date: iso(n), kg: +(kg + noise(n)).toFixed(1) });
    }
    const r = plateau(toDayRecords(history, weights), 480);
    expect(r.cause).not.toBe("not_plateau");
    // длина — оценка: вода ±0.35 кг в день, а «хвост» снижения тяжелее плато всего на 0.3 кг
    expect(r.weeks).toBeGreaterThanOrEqual(3);
    expect(r.weeks).toBeLessThanOrEqual(4);
  });

  it("вес ровно уходит — это не плато", () => {
    const s = live({ tdeeShift: 0, days: 56 });
    expect(plateau(toDayRecords(s.history, s.weights, s.eaten), 480, START).cause).toBe("not_plateau");
  });
});
