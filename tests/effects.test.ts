import { describe, it, expect } from "vitest";
import { personalEffects, type Yesterday } from "../src/effects";
import type { DayLog } from "../src/types";

const d = (n: number) => `2026-09-${String(n).padStart(2, "0")}`;
/** n ночей: «да» — сон короче на `shorter` минут и оценка ниже на `worse`. */
function build(yes: number, no: number, shorter: number, worse = 0) {
  const history: DayLog[] = [], yesterday: Record<string, Yesterday> = {};
  for (let i = 1; i <= yes + no; i++) {
    const isYes = i <= yes;
    const bed = isYes ? 23 * 60 + shorter : 23 * 60;          // поздний ужин → позже уснул
    history.push({ date: d(i), wokeHM: "07:00", bedHM: `${String(Math.floor(bed / 60) % 24).padStart(2, "0")}:${String(bed % 60).padStart(2, "0")}`, quality: (isYes ? 4 - worse : 4) as 1 | 2 | 3 | 4 | 5 });
    yesterday[d(i)] = { lateDinner: isYes };
  }
  return { history, yesterday };
}

describe("личный эффект «вчера было»", () => {
  it("пока меньше пяти «да» или «нет» — не готово, видно, сколько есть", () => {
    const { history, yesterday } = build(4, 6, 30);
    const e = personalEffects(history, yesterday, 480).find(x => x.factor === "lateDinner")!;
    expect(e).toMatchObject({ ready: false, yes: 4, no: 6 });
  });
  it("после поздних ужинов сон короче — так и сказано, наблюдением", () => {
    const { history, yesterday } = build(5, 5, 25);
    const e = personalEffects(history, yesterday, 480).find(x => x.factor === "lateDinner")!;
    expect(e.ready).toBe(true);
    expect(e.sleepDiffMin).toBe(-25);
    expect(e.textRU).toBe("после поздних ужинов ты спишь в среднем на 25 мин меньше");
  });
  it("разница меньше 10 минут и 0.3 балла — «заметной разницы нет»", () => {
    const { history, yesterday } = build(5, 5, 5);
    expect(personalEffects(history, yesterday, 480).find(x => x.factor === "lateDinner")!.textRU)
      .toBe("после поздних ужинов заметной разницы нет");
  });
  it("по оценке сна, когда длительность не изменилась", () => {
    const { history, yesterday } = build(5, 5, 0, 1);
    expect(personalEffects(history, yesterday, 480).find(x => x.factor === "lateDinner")!.textRU)
      .toBe("после поздних ужинов оценка сна ниже на 1.0");
  });
  it("алкоголь берётся и из отметки ночи (hadAlcohol)", () => {
    const history: DayLog[] = [];
    for (let i = 1; i <= 10; i++) history.push({ date: d(i), wokeHM: "07:00", quality: i <= 5 ? 2 : 4, ...(i <= 5 ? { hadAlcohol: true } : {}) });
    const e = personalEffects(history, {}, 480).find(x => x.factor === "alcohol")!;
    expect(e).toMatchObject({ ready: true, yes: 5, no: 5 });
    expect(e.textRU).toBe("после алкоголя оценка сна ниже на 2.0");
  });
});
