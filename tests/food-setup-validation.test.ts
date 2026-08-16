import { describe, it, expect } from "vitest";
import { checkProfile } from "../src/ui/FoodSetup";

/**
 * Форма — граница доверия: дальше числа идут прямо в расчёт нормы калорий и белка.
 * Пустое поле даёт ноль, буква — NaN; и то и другое раньше проходило молча.
 */
describe("проверка данных о себе", () => {
  const ok = { age: 32, heightCm: 178, weightKg: 95, goalWeightKg: 82 };

  it("нормальные данные проходят", () => {
    expect(checkProfile(ok)).toEqual([]);
  });

  it("пустое поле не проходит", () => {
    expect(checkProfile({ ...ok, weightKg: 0 })).toContain("вес сейчас — от 35 до 250");
  });

  it("буква в поле (NaN) не проходит", () => {
    expect(checkProfile({ ...ok, age: NaN })).toEqual(["возраст — от 18 до 90"]);
  });

  it("несколько ошибок перечисляются разом", () => {
    expect(checkProfile({ age: 0, heightCm: 0, weightKg: 0, goalWeightKg: 0 }).length).toBeGreaterThanOrEqual(4);
  });

  /**
   * Приложение ведёт к снижению веса: считает дефицит, темп и лестницу входа.
   * На цели тяжелее текущего веса все эти цифры теряют смысл, а раньше форма
   * пропускала такую цель молча.
   */
  it("цель тяжелее текущего веса не проходит", () => {
    expect(checkProfile({ ...ok, weightKg: 70, goalWeightKg: 200 }))
      .toContain("цель по весу должна быть меньше текущего: приложение ведёт к снижению");
    expect(checkProfile({ ...ok, weightKg: 80, goalWeightKg: 80 }).length).toBeGreaterThan(0);
  });

  it("границы включаются", () => {
    expect(checkProfile({ age: 18, heightCm: 130, weightKg: 250, goalWeightKg: 35 })).toEqual([]);
  });
});
