import { describe, it, expect } from "vitest";
import { searchRecipes } from "../src/ui/Catalog";
import recipesJson from "../src/food/data/recipes.json";
import type { Recipe } from "../src/food/types";

const RECIPES = recipesJson as Recipe[];

/**
 * Каталог — единственное место, где человек видит весь набор целиком, а не семь дней
 * меню. Поиск здесь важнее списка: три сотни блюд листать никто не станет.
 */
describe("поиск по каталогу", () => {
  it("пустой запрос отдаёт весь набор", () => {
    expect(searchRecipes(RECIPES, "", "all")).toHaveLength(RECIPES.length);
  });

  it("ищет по составу, а не только по названию", () => {
    const found = searchRecipes(RECIPES, "творог", "all");
    expect(found.length).toBeGreaterThan(5);
    // хотя бы одно блюдо без слова «творог» в названии — иначе поиск идёт по заголовкам
    expect(found.some(r => !r.name.toLowerCase().includes("творог"))).toBe(true);
  });

  it("фильтр по приёму сужает набор", () => {
    const snacks = searchRecipes(RECIPES, "", "snack");
    expect(snacks.length).toBeGreaterThan(10);
    expect(snacks.every(r => r.meal_type === "snack")).toBe(true);
  });

  it("регистр и пробелы по краям не мешают", () => {
    expect(searchRecipes(RECIPES, "  КУРИЦА  ", "all").length)
      .toBe(searchRecipes(RECIPES, "курица", "all").length);
  });

  it("выдача отсортирована по алфавиту", () => {
    const names = searchRecipes(RECIPES, "", "lunch").map(r => r.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "ru")));
  });

  it("бессмысленный запрос не находит ничего и не падает", () => {
    expect(searchRecipes(RECIPES, "щщщ", "all")).toEqual([]);
  });
});
