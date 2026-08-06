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
 *
 * Черновик — .ts-файл с `export const DRAFT: Draft[]`. Состав пишется как в источнике
 * (на `servings` порций), скрипт сам делит на одну порцию.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { NUTRIENTS, gramsOf } from "../src/food/nutrients";
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
  /** Ссылка на страницу источника. Обязательна: рецепты берутся из интернета, а не сочиняются. */
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

function checkMeta(drafts: Draft[], existing: Recipe[]): string[] {
  const problems: string[] = [];
  const taken = new Set(existing.map(r => r.id));
  for (const d of drafts) {
    if (taken.has(d.id)) problems.push(`id «${d.id}» уже занят`);
    taken.add(d.id);
    if (!/^https?:\/\//.test(d.src)) problems.push(`«${d.name}»: нет ссылки на источник`);
    if (!d.servings || d.servings < 1) problems.push(`«${d.name}»: не указано число порций оригинала`);
    if (!d.steps.length) problems.push(`«${d.name}»: нет шагов`);
  }
  return problems;
}

/** Макросы на одну порцию + плотность энергии (ккал/г) — рычаг сытости. */
function build(d: Draft): Recipe {
  let kcal = 0, protein = 0, fiber = 0, weight = 0;
  for (const [name, qty, unit] of d.ings) {
    const g = gramsOf(name, qty, unit);
    const [k, p, f] = NUTRIENTS[name.toLowerCase().trim()];
    kcal += (k * g) / 100;
    protein += (p * g) / 100;
    fiber += (f * g) / 100;
    weight += g;
  }
  const per = d.servings;
  return {
    id: d.id,
    name: d.name,
    meal_type: d.type,
    cuisine: d.cuisine,
    kcal: Math.round(kcal / per),
    protein_g: Math.round((protein / per) * 10) / 10,
    fiber_g: Math.round((fiber / per) * 10) / 10,
    energy_density: Math.round((kcal / weight) * 100) / 100,
    cookware: d.cookware,
    allergens: d.allergens,
    tags: [],
    difficulty: d.difficulty,
    time_min: d.time,
    source: d.src,
    ingredients: d.ings.map(([name, qty, unit, category]) => ({
      name,
      qty: Math.round((qty / per) * 10) / 10,
      unit,
      category,
    })),
    steps: d.steps,
  };
}

const draftPath = process.argv[2];
const dry = process.argv.includes("--dry");
if (!draftPath) {
  console.error("укажи файл черновика: npx vite-node scripts/add-recipes.ts scripts/drafts/<файл>.ts");
  process.exit(1);
}

const { DRAFT } = (await import(pathToFileURL(resolve(draftPath)).href)) as { DRAFT: Draft[] };
const existing = JSON.parse(readFileSync(RECIPES_PATH, "utf8")) as Recipe[];

const problems = [...checkMeta(DRAFT, existing), ...checkProducts(DRAFT)];
if (problems.length) {
  console.error(`Не добавлено, сначала почини ${problems.length}:`);
  for (const p of problems) console.error("  ·", p);
  process.exit(1);
}

const added = DRAFT.map(build);
for (const r of added) {
  console.log(`${r.id}  ${r.kcal} ккал · белок ${r.protein_g} · клетчатка ${r.fiber_g}  ${r.name}`);
}

if (dry) {
  console.log("\n--dry: файл не тронут");
} else {
  writeFileSync(RECIPES_PATH, JSON.stringify([...existing, ...added], null, 2) + "\n", "utf8");
  console.log(`\nДобавлено ${added.length}, всего ${existing.length + added.length}. Дальше: npm test`);
}
