import { describe, it, expect } from "vitest";
import { backupDue, daysSince } from "../src/ui/dataSafety";

describe("напоминание о копии данных", () => {
  it("молчит, пока копировать нечего", () => {
    expect(backupDue(null, "2026-09-23", 2)).toBe(false);
  });
  it("зовёт, если данных уже на три дня, а копии нет", () => {
    expect(backupDue(null, "2026-09-23", 3)).toBe(true);
  });
  it("не зовёт, если копии меньше недели", () => {
    expect(backupDue("2026-09-17", "2026-09-23", 30)).toBe(false);
  });
  it("зовёт через семь дней после копии", () => {
    expect(backupDue("2026-09-16", "2026-09-23", 30)).toBe(true);
  });
  it("битая отметка — как будто копии нет", () => {
    expect(backupDue("мусор", "2026-09-23", 5)).toBe(true);
  });
  it("считает дни по календарю", () => {
    expect(daysSince("2026-09-14", "2026-09-23")).toBe(9);
  });
});
