/**
 * Добавление рецептов в базу: макросы считаются из состава, а не переносятся с сайта.
 *
 * Зачем скрипт. Калорийность когда-то лежала отдельным полем, записанным на глаз, и
 * 16 рецептов из 31 расходились со своим же составом на 15 % и больше. Теперь единственный
 * источник истины — ингредиенты, а этот скрипт не даёт занести рецепт мимо справочников:
 * нет нутриентов, нет цены, нет пояснения «что брать» — рецепт не добавится.
 *
 * Запуск:
 *   npx vite-node scripts/add-recipes.ts scripts/drafts/<файл>.ts
 *   npx vite-node scripts/add-recipes.ts scripts/drafts/<файл>.ts --dry
 *   npx vite-node scripts/add-recipes.ts scripts/drafts/<файл>.ts --replace   # пересобрать существующие id из источника
 *
 * Черновик — .ts-файл с `export const DRAFT: Draft[]`. Состав пишется как в источнике
 * (на `servings` порций), скрипт сам делит на одну порцию.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { NUTRIENTS, macrosOf } from "../src/food/nutrients";
import { PRICES, UNKNOWN_PRICE } from "../src/food/prices";
import { hasHint } from "../src/food/ingredients";
import type { Recipe, MealType, Cuisine } from "../src/food/types";

/** Как рецепт выписывается из источника: [название, количество, единица, категория]. */
export type DraftIng = [name: string, qty: number, unit: string, category: string];

export interface Draft {
  id: string;
  name: string;
  type: MealType;
  cuisine: Cuisine;
  /**
   * Ссылка на страницу источника — либо пустая строка, если рецепт написан для приложения.
   *
   * Раньше поле было обязательным, и это дало обратный эффект: в партиях I–L появились
   * 19 правдоподобных, но НЕСУЩЕСТВУЮЩИХ ссылок (проверка показала 404). Выдуманный
   * источник хуже отсутствующего — он выглядит как проверенный факт. Теперь честных
   * вариантов ровно два: настоящая ссылка или пусто, и тогда приложение прямо пишет
   * «рецепт составлен для приложения».
   */
  src: string;
  /** На сколько порций рассчитан ОРИГИНАЛ. В источниках сплошь «филе 1 кг» на четверых. */
  servings: number;
  cookware: string[];
  allergens: string[];
  difficulty: 1 | 2 | 3;
  time: number;
  ings: DraftIng[];
  /** Шаги своими словами: тексты инструкций охраняются авторским правом, состав — нет. */
  steps: string[];
}

/** Те же неоднозначные названия, что проверяет tests/food-ingredients.test.ts. */
const VAGUE = /^(овощ|свежие овощи|зелень|ягоды|мёд|мука|сыр|творог|йогурт|паста |гранола)/i;

const RECIPES_PATH = resolve(import.meta.dirname, "../src/food/data/recipes.json");

function checkProducts(drafts: Draft[]): string[] {
  const problems: string[] = [];
  const names = [...new Set(drafts.flatMap(d => d.ings.map(i => i[0].toLowerCase().trim())))];
  for (const n of names) {
    if (!NUTRIENTS[n]) problems.push(`«${n}»: нет в nutrients.ts — блюдо не посчитать`);
    if (!PRICES[n] && !UNKNOWN_PRICE.has(n)) problems.push(`«${n}»: нет в prices.ts — неделя выйдет дешевле, чем есть`);
    if (VAGUE.test(n) && !hasHint(n)) problems.push(`«${n}»: нет пояснения в ingredients.ts — у прилавка непонятно, что брать`);
  }
  return problems;
}

function checkMeta(drafts: Draft[], existing: Recipe[], replace = false): string[] {
  const problems: string[] = [];
  const taken = new Set(existing.map(r => r.id));
  for (const d of drafts) {
    // --replace: рецепт, написанный для приложения, пересобирается по найденному источнику — состав и ссылка
    if (taken.has(d.id) && !replace) problems.push(`id «${d.id}» уже занят`);
    if (!taken.has(d.id) && replace) problems.push(`id «${d.id}» нет в базе — нечего заменять`);
    taken.add(d.id);
    // либо настоящая ссылка, либо честно пусто — «почти похоже на ссылку» не принимаем
    if (d.src !== "" && !/^https?:\/\/\S+$/.test(d.src)) {
      problems.push(`«${d.name}»: src должен быть настоящей ссылкой или пустой строкой`);
    }
    if (!d.servings || d.servings < 1) problems.push(`«${d.name}»: не указано число порций оригинала`);
    if (!d.steps.length) problems.push(`«${d.name}»: нет шагов`);
  }
  return problems;
}

function build(d: Draft): Recipe {
  const ingredients = d.ings.map(([name, qty, unit, category]) => ({
    name,
    qty: Math.round((qty / d.servings) * 10) / 10,
    unit,
    category,
  }));
  return {
    id: d.id,
    name: d.name,
    meal_type: d.type,
    cuisine: d.cuisine,
    ...macrosOf(ingredients),
    cookware: d.cookware,
    allergens: d.allergens,
    tags: [],
    difficulty: d.difficulty,
    time_min: d.time,
    // пустая ссылка не пишется в базу: пусть у рецепта просто не будет поля источника
    ...(d.src ? { source: d.src } : {}),
    ingredients,
    steps: d.steps,
  };
}

const draftPath = process.argv[2];
const dry = process.argv.includes("--dry");
const replace = process.argv.includes("--replace");
if (!draftPath) {
  console.error("укажи файл черновика: npx vite-node scripts/add-recipes.ts scripts/drafts/<файл>.ts");
  process.exit(1);
} else {
  const { DRAFT } = (await import(resolve(draftPath)))  // путь, не file-URL: в URL пробелы папки становятся %20, и vite-node его не находит as { DRAFT: Draft[] };
  const existing = JSON.parse(readFileSync(RECIPES_PATH, "utf8")) as Recipe[];

  const problems = [...checkMeta(DRAFT, existing, replace), ...checkProducts(DRAFT)];
  if (problems.length) {
    console.error(`Не добавлено, сначала почини ${problems.length}:`);
    for (const p of problems) console.error("  ·", p);
    process.exit(1);
  }

  const added = DRAFT.map(build);
  for (const r of added) {
    const was = replace ? existing.find(x => x.id === r.id) : undefined;
    console.log(`${r.id}  ${r.kcal} ккал · белок ${r.protein_g} · клетчатка ${r.fiber_g}  ${r.name}${was ? `   (было ${was.kcal} ккал · белок ${was.protein_g})` : ""}`);
  }

  if (dry) {
    console.log("\n--dry: файл не тронут");
  } else if (replace) {
    // оценки, память меню и замены живут по id — он не меняется, меняются состав, макросы и ссылка
    const byId = new Map(added.map(r => [r.id, r]));
    const next = existing.map(r => byId.get(r.id) ?? r);
    writeFileSync(RECIPES_PATH, JSON.stringify(next, null, 2) + "\n", "utf8");
    console.log(`\nЗаменено ${added.length}. Дальше: npm test`);
  } else {
    writeFileSync(RECIPES_PATH, JSON.stringify([...existing, ...added], null, 2) + "\n", "utf8");
    console.log(`\nДобавлено ${added.length}, всего ${existing.length + added.length}. Дальше: npm test`);
  }
}
