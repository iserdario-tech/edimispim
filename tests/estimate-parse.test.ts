import { describe, it, expect } from "vitest";
import { parseEstimate } from "../worker/src/estimate";

describe("разбор прикидки калорий от модели", () => {
  it("складывает позиции и подписывает каждую", () => {
    const r = parseEstimate('{"items":[{"name":"шаурма","kcal":560,"protein":28},{"name":"кола 0.5 л","kcal":210,"protein":0}],"note":"x"}');
    expect(r).toEqual({ kcal: 770, protein: 28, labelRU: "шаурма ≈ 560, кола 0.5 л ≈ 210" });
  });
  it("достаёт JSON из обёртки ```json и текста вокруг", () => {
    const r = parseEstimate('Вот оценка:\n```json\n{"items":[{"name":"гречка","kcal":300,"protein":11}]}\n```');
    expect(r?.kcal).toBe(300);
  });
  it("не еда — нет оценки", () => {
    expect(parseEstimate('{"items":[],"note":"не похоже на еду"}')).toBeNull();
  });
  it("абсурдные числа отбрасывает", () => {
    expect(parseEstimate('{"items":[{"name":"торт","kcal":50000}]}')).toBeNull();
    expect(parseEstimate('{"items":[{"name":"торт","kcal":"много"}]}')).toBeNull();
  });
  it("мусор вместо JSON — нет оценки, а не падение", () => {
    expect(parseEstimate("я не знаю")).toBeNull();
    expect(parseEstimate("{сломано")).toBeNull();
  });
});
