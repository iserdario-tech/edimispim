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
    expect(kindOf("Куриный суп с лапшой")).toBe("soup");
    expect(kindOf("Гороховый суп с копчёными рёбрышками")).toBe("soup");
    expect(kindOf("Салат капрезе")).toBe("salad");
    expect(kindOf("Шоколадный протеиновый мусс")).toBe("dessert");
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
    expect(kinds.size).toBeGreaterThan(12);
  });
});
