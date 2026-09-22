import { targetsFor, type FoodSettings } from "./storage.js";
import { targetsForToday, prefersFamiliar, type DayRhythm } from "../food/index.js";

/** «Сегодня не готовлю»: блюда до десяти минут — собрать, а не готовить. */
export const NO_COOK_MIN = 10;

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
) {
  const { ramp } = targetsForToday(targetsFor(food), food.startISO, iso, food.pace);
  const limit = cookLimitFor(food, iso, !!noCookDays?.includes(iso));
  return {
    rhythm, mealCount: food.mealCount, familiar: prefersFamiliar(ramp), liked,
    ...(limit !== undefined ? { maxCookMin: limit } : {}),
    ...(food.leftovers ? { leftovers: true } : {}),
  };
}
