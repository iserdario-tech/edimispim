/**
 * Аудит планировщика: 12 недель × 8 конфигураций (2/3/4/5 приёмов × вход в режим и цель).
 * Печатает усилие готовки, минуты, белок, клетчатку, отклонение калорий, разных блюд в неделю.
 * Любая правка планировщика — прогон до и после (решение Сердара 2026-10-07).
 * Запуск: npx vite-node scripts/audit-planner.ts
 */
import recipes from "../src/food/data/recipes.json";
import { planBlock, isoOfDay, dayNumber } from "../src/food/schedule";
import { effortOf } from "../src/food/planner";
import type { Recipe, Targets, MealCount } from "../src/food/types";
const ALL = recipes as Recipe[];
const targets: Targets = { bmr: 1700, tdee: 2300, kcalTarget: 1800, proteinGTarget: 130, fiberGTarget: 30, tempoKgPerWeek: 0.5 };
const rhythm = { wakeMin: 7 * 60, bedMin: 23 * 60 };
const start = dayNumber("2026-10-05");
let agg = { effort: 0, time: 0, protein: 0, fiber: 0, kdev: 0, distinct: 0, n: 0, weeks: 0 };
for (const mealCount of [2, 3, 4, 5] as MealCount[]) for (const familiar of [false, true]) {
  for (let w = 0; w < 12; w++) {
    const week = planBlock(isoOfDay(start + w * 7), ALL, () => targets, () => ({ rhythm, mealCount, familiar }));
    const ids = new Set<string>();
    for (const d of week) {
      const mains = d.day.meals.filter(m => !m.leftover && m.slot !== "dessert" && m.slot !== "snack");
      for (const m of mains) { agg.effort += effortOf(m.recipe); agg.time += m.recipe.time_min ?? 0; }
      agg.n += mains.length; agg.protein += d.day.totals.protein; agg.fiber += d.day.totals.fiber; agg.kdev += Math.abs(d.day.totals.kcal - 1800) / 1800;
      for (const m of d.day.meals) ids.add(m.recipe.id);
    }
    agg.distinct += ids.size; agg.weeks += 1;
  }
}
console.log(`ИТОГО | усилие ${(agg.effort / agg.n).toFixed(0)} | мин ${(agg.time / agg.n).toFixed(0)} | белок ${(agg.protein / (agg.weeks * 7)).toFixed(0)} | клетчатка ${(agg.fiber / (agg.weeks * 7)).toFixed(1)} | ккал откл ${(100 * agg.kdev / (agg.weeks * 7)).toFixed(1)}% | разных/нед ${(agg.distinct / agg.weeks).toFixed(1)}`);
