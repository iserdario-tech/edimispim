import { describe, it, expect } from "vitest";
import { regularityScore } from "../src/regularity.js";
const mk = (wokeHM:string, d:number) => ({ date:`2026-06-${String(d).padStart(2,"0")}`, wokeHM, quality:3 as const });
describe("regularity", () => {
  it("identical wake times -> 100", () => {
    expect(regularityScore([mk("07:00",1),mk("07:00",2),mk("07:00",3),mk("07:00",4)])).toBe(100);
  });
  it("one outlier forgiven (MAD) -> still high", () => {
    const s = regularityScore([mk("07:00",1),mk("07:00",2),mk("07:00",3),mk("07:00",4),mk("10:00",5)]);
    expect(s).toBeGreaterThanOrEqual(90); // median-based: single outlier tolerated
  });

  /**
   * Раньше здесь стояло `empty -> 100`, и тест закреплял ровно тот дефект, который
   * потом вылез на живом экране: человеку без единой отмеченной ночи приложение
   * показывало «регулярность 100/100» — в статусе дня, в итогах недели и в ровности
   * режима сразу. Отсутствие данных — это не отличный результат.
   */
  it("пустая история — это не сто баллов, а отсутствие ответа", () => {
    expect(regularityScore([])).toBeNull();
  });
  it("трёх ночей ещё мало — цифры нет", () => {
    expect(regularityScore([mk("07:00",1),mk("07:00",2),mk("07:00",3)])).toBeNull();
  });
});
