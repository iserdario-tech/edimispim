import { describe, it, expect } from "vitest";
import { hintFor, hasHint, HINTS } from "../src/food/ingredients";
import recipesJson from "../src/food/data/recipes.json";
import type { Recipe } from "../src/food/types";

const recipes = recipesJson as Recipe[];
const allNames = [...new Set(recipes.flatMap(r => (r.ingredients ?? []).map(i => i.name)))];

/** Названия, по которым у прилавка непонятно, что брать. */
const VAGUE = /^(овощ|свежие овощи|зелень|ягоды|мёд|мука|сыр|творог|йогурт|паста |гранола)/i;

describe("пояснения к продуктам", () => {
  it("у каждого неоднозначного названия есть подсказка, что именно брать", () => {
    const vague = allNames.filter(n => VAGUE.test(n));
    const without = vague.filter(n => !hasHint(n));
    expect(without, `без пояснения: ${without.join(", ")}`).toHaveLength(0);
  });

  it("творог 5% и мягкий различаются, и объяснено почему", () => {
    const plain = hintFor("творог 5%")!;
    const soft = hintFor("творог мягкий")!;
    expect(plain.what).not.toBe(soft.what);
    expect(soft.why).toMatch(/крем|блендер/i);   // замена меняет результат
  });

  it("регистр и пробелы не мешают найти пояснение", () => {
    expect(hintFor("  Творог 5%  ")).toEqual(hintFor("творог 5%"));
  });

  it("пояснения короткие — это подпись, а не статья", () => {
    for (const [name, h] of Object.entries(HINTS)) {
      expect(h.what.length, `«${name}» слишком длинное`).toBeLessThan(90);
      if (h.why) expect(h.why.length, `«${name}» почему слишком длинное`).toBeLessThan(120);
    }
  });

  it("подсказки написаны про магазин, а не про кулинарию", () => {
    // «что брать», а не «как готовить» — в списке покупок нужно первое
    expect(hintFor("тунец консервированный")!.what).toMatch(/собственном соку/);
    expect(hintFor("овощная смесь")!.what).toMatch(/заморож/);
  });

  it("незнакомый продукт не выдумывает пояснение", () => {
    expect(hintFor("несуществующий продукт")).toBeUndefined();
    expect(hasHint("куриное филе")).toBe(false);   // и так понятно, подсказка не нужна
  });
});
