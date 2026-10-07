import { targetsFor, type FoodSettings } from "./storage.js";
import { targetsForToday, prefersFamiliar, withinCookTime, type DayRhythm } from "../food/index.js";
import type { Recipe, SafeTargets } from "../food/types.js";

/** «Сегодня не готовлю»: блюда до десяти минут — собрать, а не готовить. */
export const NO_COOK_MIN = 10;

/** На сколько дней готовится обед и ужин. Старая галочка «обед из остатков» — это два дня. */
export const cookDaysOf = (food: FoodSettings): number => food.cookDays ?? (food.leftovers ? 2 : 1);

/**
 * Сколько минут на готовку в эту дату. Одна функция на оба экрана: иначе «Сегодня»
 * и «Еда» снова показали бы разное меню на один и тот же день.
 */
export function cookLimitFor(food: FoodSettings, iso: string, noCook: boolean): number | undefined {
  if (noCook) return NO_COOK_MIN;
  const dow = new Date(iso + "T12:00:00Z").getUTCDay();
  return dow === 0 || dow === 6 ? food.cookMin?.weekend : food.cookMin?.weekday;
}

/**
 * Настройки планировщика для даты — одни на оба экрана.
 *
 * «Сегодня» раньше собирало всю семидневку с сегодняшними настройками. Пока от даты
 * зависела только привычность еды, разница была незаметной; с лимитом готовки она стала
 * видна сразу: «не готовлю сегодня» перестраивало и вчерашний ужин, а суббота на «Сегодня»
 * считалась будней — и меню дня расходилось с вкладкой «Еда».
 */
export function dayOptsFor(
  food: FoodSettings, iso: string, rhythm: DayRhythm, liked: string[], noCookDays: string[] | undefined,
  base: SafeTargets = targetsFor(food),
) {
  const { ramp } = targetsForToday(base, food.startISO, iso, food.pace);
  const noCook = !!noCookDays?.includes(iso);
  const limit = cookLimitFor(food, iso, noCook);
  const cookDays = cookDaysOf(food);
  return {
    rhythm, mealCount: food.mealCount, familiar: prefersFamiliar(ramp), liked,
    ...(limit !== undefined ? { maxCookMin: limit } : {}),
    ...(cookDays > 1 ? { cookDays } : {}),
    ...(noCook ? { noCook: true } : {}),
  };
}

/** Набор блюд для замены в эту дату — с тем же лимитом готовки, что и сам день:
 *  иначе ↻ в день «не готовлю» предлагал бигос на полтора часа. */
export const poolForDate = (pool: Recipe[], food: FoodSettings, iso: string, noCookDays: string[] | undefined): Recipe[] =>
  withinCookTime(pool, cookLimitFor(food, iso, !!noCookDays?.includes(iso)));
