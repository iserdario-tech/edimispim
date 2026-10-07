import { describe, it, expect } from "vitest";
import { makeCode, normCode, isCode, idOf, encrypt, decrypt } from "../src/cloud";
import { WORDS } from "../src/cloudWords";

/**
 * Копия в облаке по коду из четырёх слов. Код живёт только на телефоне: на сервер уходит
 * адрес копии (хэш кода) и зашифрованные данные. Без кода копию не прочитать никому.
 */
describe("код восстановления", () => {
  it("512 разных слов без «ё»", () => {
    expect(WORDS).toHaveLength(512);
    expect(new Set(WORDS).size).toBe(512);
    expect(WORDS.some(w => w.includes("ё"))).toBe(false);
  });
  it("четыре слова через дефис", () => {
    const c = makeCode();
    expect(c.split("-")).toHaveLength(4);
    expect(isCode(c)).toBe(true);
  });
  it("набранный как попало код понимается: регистр, «ё», пробелы, запятые", () => {
    expect(normCode("  Лиса, река  ГРОМ — сыр ")).toBe("лиса-река-гром-сыр");
    expect(normCode("ёж-лиса-река-сыр")).toBe("еж-лиса-река-сыр");
  });
  it("не код — не код", () => {
    expect(isCode("лиса-река-гром")).toBe(false);
    expect(isCode("лиса-река-гром-абракадабра")).toBe(false);
  });
});

describe("шифрование", () => {
  it("адрес копии — хэш кода, одинаковый на любом телефоне, и сам код не раскрывает", async () => {
    const id = await idOf("лиса-река-гром-сыр");
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(await idOf("Лиса река гром сыр")).toBe(id);
    expect(id).not.toContain("лиса");
  });
  it("туда и обратно — те же данные", async () => {
    const data = JSON.stringify({ state: "ночи, вес, еда", n: 42 });
    const blob = await encrypt("лиса-река-гром-сыр", data);
    expect(blob).not.toContain("ночи");
    expect(await decrypt("лиса-река-гром-сыр", blob)).toBe(data);
  });
  it("полгода данных (300 КБ) не роняет кодирование", async () => {
    const data = "ночь;".repeat(60_000);
    expect(await decrypt("лиса-река-гром-сыр", await encrypt("лиса-река-гром-сыр", data))).toBe(data);
  });
  it("чужой код не открывает копию", async () => {
    const blob = await encrypt("лиса-река-гром-сыр", "секрет");
    await expect(decrypt("лиса-река-гром-кот", blob)).rejects.toThrow();
  });
});
