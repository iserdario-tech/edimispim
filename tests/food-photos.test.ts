import { describe, it, expect } from "vitest";
import { photoFor, PHOTOS } from "../src/food/photos";
import recipesJson from "../src/food/data/recipes.json";
import type { Recipe } from "../src/food/types";

const RECIPES = recipesJson as Recipe[];

/**
 * Картинка есть у каждого блюда — это опора всей новой вёрстки: строка без фото
 * ломает ритм списка сильнее, чем неточная фотография.
 */
describe("фотографии блюд", () => {
  it("подбирается всем 100% блюд", () => {
    for (const r of RECIPES) expect(photoFor(r), r.name).toBeTruthy();
  });

  it("тип угадывается по смыслу, а не по первому слову", () => {
    const kindOf = (name: string) => {
      const r = RECIPES.find(x => x.name === name);
      return r ? photoFor(r).file.replace(".jpg", "") : "нет такого блюда";
    };
    // «куриный суп» — это суп, а не курица: конкретное правило стоит выше общего
    // с волны 40 у супов и салатов свои снимки — главное, что не «курица» и не «рёбра»
    expect(kindOf("Куриный суп с лапшой")).toBe("chickennoodle");
    expect(kindOf("Гороховый суп с копчёными рёбрышками")).toBe("peasoup");
    expect(kindOf("Салат капрезе")).toBe("caprese");
    // ловушки конкретных правил: бананы в кляре — не рыба, пудинг из чиа — не тыквенный,
    // суп из скумбрии — суп, куриные котлеты на пару — не рыба на пару
    expect(kindOf("Бананы в кляре из рисовой муки")).not.toBe("fishbatter");
    expect(kindOf("Пудинг из чиа с бананом и киви")).toBe("chia");
    expect(kindOf("Суп из скумбрии с рисом")).not.toBe("mackerel");
    expect(kindOf("Куриные котлеты на пару")).toBe("cutlets");
    expect(kindOf("Шоколадный протеиновый мусс")).toBe("mousse");
  });

  it("состав не перебивает название: томатная паста не делает рагу макаронами", () => {
    const kindOf = (name: string) => photoFor(RECIPES.find(x => x.name === name)!).file.replace(".jpg", "");
    // раньше название и состав склеивались, и 44 блюда показывали пасту, 47 — яйца
    expect(kindOf("Голубцы с мясом и рисом")).toBe("cabbagerolls");
    expect(kindOf("Йогурт-боул с гранолой, мёдом и орехами")).toBe("granola");
    expect(kindOf("Классическая шакшука")).toBe("shakshuka");
    expect(kindOf("Митболы в томатном соусе")).toBe("meatballs");
  });

  it("ни один снимок не висит на большой доле блюд", () => {
    const count = new Map<string, number>();
    for (const r of RECIPES) { const f = photoFor(r).file; count.set(f, (count.get(f) ?? 0) + 1); }
    expect(Math.max(...count.values())).toBeLessThanOrEqual(25);
  });

  it("у каждой фотографии есть автор и лицензия", () => {
    for (const [kind, p] of Object.entries(PHOTOS)) {
      expect(p.author, kind).toBeTruthy();
      expect(p.license, kind).toBeTruthy();
      expect(p.source, kind).toMatch(/^https?:\/\//);
    }
  });

  it("разные блюда получают разные снимки — список не выглядит одинаковым", () => {
    const kinds = new Set(RECIPES.map(r => photoFor(r).file));
    expect(kinds.size).toBeGreaterThan(60);
  });
});
