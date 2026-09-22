import { describe, it, expect } from "vitest";
import { toggleMark, eatenTotals, followedPlan, markAllAte, setOwnSize, type DayEaten } from "../src/food/eaten";
import { toDayRecords } from "../src/ui/dayRecords";
import { plateau } from "../src/plateau";
import type { Day } from "../src/food/types";
import type { DayLog } from "../src/types";

const meal = (slot: "breakfast" | "lunch" | "dinner" | "dessert", kcal: number, protein: number) => ({
  recipe: { id: slot, name: slot, meal_type: slot as never, kcal, protein_g: protein, fiber_g: 3 },
  servings: 1, timeMin: 600, slot,
});
const day: Day = {
  meals: [meal("breakfast", 400, 25), meal("lunch", 600, 40), meal("dinner", 500, 35), meal("dessert", 150, 5)],
  totals: { kcal: 1650, protein: 105, fiber: 12 },
};

describe("отметка «съел»: факт против плана", () => {
  it("своя еда входит в сумму прикидкой, а «съел по плану» считает только плановое", () => {
    let e: DayEaten = toggleMark(undefined, "breakfast", "ate", 4);
    e = toggleMark(e, "lunch", "own", 4);
    const t = eatenTotals(day, e);
    // раньше своё считалось нулём и сводка занижала съеденное; теперь — плановая порция как оценка
    expect(t.kcal).toBe(1000);
    expect(t.protein).toBe(65);
    expect(t.estimated).toBe(true);
    expect(t.ate).toBe(1);             // «съел по плану» — по-прежнему только завтрак
    expect(t.marked).toBe(2);
  });

  it("повторное нажатие снимает отметку — это переключатель", () => {
    const on = toggleMark(undefined, "dinner", "ate", 4);
    expect(on.marks.dinner).toBe("ate");
    expect(toggleMark(on, "dinner", "ate", 4).marks.dinner).toBeUndefined();
    expect(toggleMark(on, "dinner", "own", 4).marks.dinner).toBe("own");
  });

  it("нетронутый день — это не провал, а отсутствие данных", () => {
    expect(followedPlan(undefined)).toBeUndefined();
    expect(followedPlan({ marks: {}, planned: 4 })).toBeUndefined();
  });

  it("три приёма из четырёх — день засчитан, один — нет", () => {
    const three: DayEaten = { marks: { breakfast: "ate", lunch: "ate", dinner: "ate" }, planned: 4 };
    const one: DayEaten = { marks: { breakfast: "ate", lunch: "own", dinner: "own" }, planned: 4 };
    expect(followedPlan(three)).toBe(true);
    expect(followedPlan(one)).toBe(false);
  });

  /**
   * Ради этого всё и делалось: разбор плато умеет отличать «еда течёт» от «сон течёт»,
   * но поле `food.followed` не заполнял никто — ветка про еду не могла сработать ни разу.
   */
  it("плато теперь видит еду, а не только сон", () => {
    const dates = [...Array(21)].map((_, i) =>
      new Date(Date.UTC(2026, 6, 1 + i)).toISOString().slice(0, 10));
    // сон ровный и достаточный, вес стоит, а по плану еды прошло меньше половины дней
    const history: DayLog[] = dates.map(date => ({ date, wokeHM: "07:00", bedHM: "23:00", quality: 4 }));
    const weights = dates.filter((_, i) => i % 7 === 0).map(date => ({ date, kg: 90 }));
    const eaten: Record<string, DayEaten> = {};
    dates.forEach((date, i) => {
      eaten[date] = i % 4 === 0
        ? { marks: { breakfast: "ate", lunch: "ate", dinner: "ate" }, planned: 4 }
        : { marks: { breakfast: "own", lunch: "own" }, planned: 4 };
    });

    const withFood = plateau(toDayRecords(history, weights, eaten), 465);
    expect(withFood.cause).toBe("food");

    // без отметок — та же история молчит про еду
    expect(plateau(toDayRecords(history, weights), 465).cause).toBe("keep_waiting");
  });
});

/**
 * Читмил объявляет сам человек, и приложение не имеет права считать это срывом:
 * наказывать за честно объявленное заранее — значит учить не объявлять (X28).
 */
describe("читмил-день", () => {
  it("не портит статистику приверженности", () => {
    const dates = ["2026-07-01", "2026-07-02", "2026-07-03"];
    const history: DayLog[] = dates.map(date => ({ date, wokeHM: "07:00", quality: 4 }));
    const eaten: Record<string, DayEaten> = {
      "2026-07-01": { marks: { breakfast: "ate", lunch: "ate", dinner: "ate" }, planned: 4 },
      "2026-07-02": { marks: { breakfast: "own" }, planned: 4 },              // читмил
      "2026-07-03": { marks: { breakfast: "ate", lunch: "ate", dinner: "ate" }, planned: 4 },
    };
    const withCheat = toDayRecords(history, [], eaten, ["2026-07-02"]);
    const marked = withCheat.filter(d => d.food?.followed !== undefined);
    expect(marked).toHaveLength(2);
    expect(marked.every(d => d.food!.followed)).toBe(true);

    // без пометки тот же день утянул бы приверженность вниз
    expect(toDayRecords(history, [], eaten).filter(d => d.food?.followed === false)).toHaveLength(1);
  });
});

describe("клетчатка в фактах дня", () => {
  it("считается только по отмеченному «съел» — своя еда не в счёт", () => {
    let e: DayEaten = toggleMark(undefined, "breakfast", "ate", 4);
    e = toggleMark(e, "lunch", "own", 4);
    // каждое блюдо в фикстуре несёт 3 г клетчатки; засчитан один завтрак
    expect(eatenTotals(day, e).fiber).toBe(3);
    expect(eatenTotals(day, undefined).fiber).toBe(0);
  });
});

describe("«весь день по плану» и размер своей еды", () => {
  it("ставит «съел» только неотмеченным — своё не перетирает", () => {
    const cur = toggleMark(undefined, "lunch", "own", 4);
    const e = markAllAte(cur, ["breakfast", "lunch", "dinner", "dessert"], 4);
    expect(e.marks).toEqual({ breakfast: "ate", lunch: "own", dinner: "ate", dessert: "ate" });
    expect(e.planned).toBe(4);
  });
  it("своё без размера считается как плановая порция и помечается оценкой", () => {
    const e = toggleMark(undefined, "lunch", "own", 4);
    const t = eatenTotals(day, e);
    expect(t.kcal).toBe(600);
    expect(t.protein).toBe(40);
    expect(t.estimated).toBe(true);
  });
  it("плотное своё — в полтора раза больше плана, лёгкое — 0.6", () => {
    let e = toggleMark(undefined, "lunch", "own", 4);
    e = setOwnSize(e, "lunch", "big");
    expect(eatenTotals(day, e).kcal).toBe(900);
    e = setOwnSize(e, "lunch", "light");
    expect(eatenTotals(day, e).kcal).toBe(360);
  });
  it("клетчатку своей еды не выдумываем", () => {
    const e = toggleMark(undefined, "lunch", "own", 4);
    expect(eatenTotals(day, e).fiber).toBe(0);
  });
  it("съеденное по плану — не оценка", () => {
    const e = toggleMark(undefined, "breakfast", "ate", 4);
    expect(eatenTotals(day, e).estimated).toBe(false);
  });
  it("снятая отметка «своё» забывает и размер", () => {
    let e = toggleMark(undefined, "lunch", "own", 4);
    e = setOwnSize(e, "lunch", "big");
    e = toggleMark(e, "lunch", "own", 4);
    expect(e.sizes?.lunch).toBeUndefined();
  });
});
