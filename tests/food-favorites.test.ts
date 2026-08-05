import { describe, it, expect } from "vitest";
import { extractProductUrl, favKey } from "../src/food/favorites";

describe("ключ «мои товары»", () => {
  it("товар помнится отдельно для каждого сервиса", () => {
    expect(favKey("помидоры", "vkusvill")).not.toBe(favKey("помидоры", "lavka"));
  });

  it("регистр и пробелы не создают дублей", () => {
    expect(favKey("  Помидоры ", "lavka")).toBe(favKey("помидоры", "lavka"));
  });
});

describe("ссылка на товар из буфера", () => {
  it("достаёт адрес из текста, который копируется из приложения", () => {
    const url = extractProductUrl("Смотри что нашёл: https://vkusvill.ru/goods/pomidory-cherri-250g.html");
    expect(url).toBe("https://vkusvill.ru/goods/pomidory-cherri-250g.html");
  });

  it("отрезает рекламные хвосты, чтобы не таскать чужую аналитику", () => {
    const url = extractProductUrl("https://lavka.yandex.ru/product/123?utm_source=share&utm_medium=ios&erid=xxx&sku=9");
    expect(url).toContain("sku=9");
    expect(url).not.toContain("utm_");
    expect(url).not.toContain("erid");
  });

  it("чистая ссылка не портится", () => {
    const clean = "https://samokat.ru/product/tvorog-5-200g";
    expect(extractProductUrl(clean)).toBe(clean);
  });

  it("текст без ссылки — честный null, а не выдуманный адрес", () => {
    expect(extractProductUrl("просто помидоры")).toBeNull();
    expect(extractProductUrl("")).toBeNull();
  });

  it("битая ссылка не роняет разбор", () => {
    expect(() => extractProductUrl("http://")).not.toThrow();
  });
});
