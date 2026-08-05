import { describe, it, expect } from "vitest";
import { SHOPS, shopById, searchTerm, searchUrl, listAsText, DEFAULT_SHOP_ID, opensInNewTab } from "../src/food/shops";

describe("справочник сервисов доставки", () => {
  it("у каждого сервиса есть подстановка запроса", () => {
    for (const s of SHOPS) {
      expect(s.searchUrl).toContain("%s");
      expect(s.searchUrl.startsWith("https://")).toBe(true);
    }
  });

  it("идентификаторы уникальны", () => {
    expect(new Set(SHOPS.map(s => s.id)).size).toBe(SHOPS.length);
  });

  it("сервис по умолчанию существует", () => {
    expect(shopById(DEFAULT_SHOP_ID).id).toBe(DEFAULT_SHOP_ID);
  });

  it("неизвестный id не роняет приложение, а даёт первый сервис", () => {
    expect(shopById("такого-нет").id).toBe(SHOPS[0]!.id);
  });
});

describe("поисковый запрос", () => {
  it("скобочные уточнения выкидываются: магазину они мешают", () => {
    expect(searchTerm("фасоль (консервированная)")).toBe("фасоль");
  });

  it("лишние пробелы схлопываются", () => {
    expect(searchTerm("  куриное   филе  ")).toBe("куриное филе");
  });

  it("кириллица кодируется корректно", () => {
    const url = searchUrl(shopById("vkusvill"), "гречка");
    expect(url).toBe("https://vkusvill.ru/search/?q=%D0%B3%D1%80%D0%B5%D1%87%D0%BA%D0%B0");
    expect(decodeURIComponent(url)).toContain("гречка");
  });

  it("количество в запрос НЕ идёт — по «250 г творога» находит хуже, чем по «творог»", () => {
    expect(searchUrl(shopById("lavka"), "творог")).not.toMatch(/250|%D0%B3%20/);
  });

  it("кавычки и амперсанд не ломают ссылку", () => {
    const url = searchUrl(shopById("ozon"), 'соус "терияки" & мисо');
    expect(() => new URL(url)).not.toThrow();
    expect(url).not.toContain('"');
    expect(url).not.toContain("&м");
  });
});

describe("список для буфера обмена", () => {
  it("человекочитаемый: название, количество, единица", () => {
    const text = listAsText([
      { name: "куриное филе", qty: 250, unit: "г" },
      { name: "рис", qty: 100, unit: "г" },
    ], "Покупки на неделю");
    expect(text).toContain("Покупки на неделю");
    expect(text).toContain("куриное филе — 250 г");
    expect(text.split("\n").filter(Boolean)).toHaveLength(3);
  });

  it("пустой список не падает", () => {
    expect(() => listAsText([])).not.toThrow();
  });
});

describe("как открывать ссылку", () => {
  it("на телефоне — в том же окне: иначе приложение магазина не перехватит ссылку", () => {
    expect(opensInNewTab(375)).toBe(false);
    expect(opensInNewTab(768)).toBe(false);
  });

  it("на широком экране — новой вкладкой, чтобы не терять список", () => {
    expect(opensInNewTab(1024)).toBe(true);
    expect(opensInNewTab(1440)).toBe(true);
  });
});
