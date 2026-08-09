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
    expect(checkProfile({ ...ok, weightKg: 0 })).toEqual(["вес сейчас — от 35 до 250"]);
  });

  it("буква в поле (NaN) не проходит", () => {
    expect(checkProfile({ ...ok, age: NaN })).toEqual(["возраст — от 18 до 90"]);
  });

  it("несколько ошибок перечисляются разом", () => {
    expect(checkProfile({ age: 0, heightCm: 0, weightKg: 0, goalWeightKg: 0 })).toHaveLength(4);
  });

  it("границы включаются", () => {
    expect(checkProfile({ age: 18, heightCm: 130, weightKg: 35, goalWeightKg: 250 })).toEqual([]);
  });
});
