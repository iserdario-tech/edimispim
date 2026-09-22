import {
  filterRecipes, generateAdaptedDay, nightChanges, diagnosePool, targetsForToday, scheduleFor, applySwaps,
  type NightSummary,
} from "../food/index.js";
import type { Recipe } from "../food/types.js";
import recipesJson from "../food/data/recipes.json";
import { parseHM } from "../index.js";
import { targetsFor, type FoodSettings } from "./storage.js";
import { dayOptsFor } from "./dayOpts.js";

const RECIPES = recipesJson as Recipe[];

/**
 * Еда на сегодня — одна функция для экрана «Сегодня» и для коуча.
 *
 * Коуч раньше знал только «питание настроено: 4 приёма» и отвечал про еду вообще.
 * Чтобы он видел то же меню, что и человек, расчёт дня вынесен сюда из экрана:
 * два места, считающие меню каждое по-своему, уже однажды показывали разную еду.
 */
export function todayFoodDay(a: {
  food: FoodSettings;
  today: string;
  wokeHM: string;
  bedMin: number;
  night: NightSummary;
  ratings?: Record<string, 1 | -1>;
  swaps?: Record<string, Record<string, string>>;
  noCookDays?: string[];
}) {
  const { food, today } = a;
  const base = targetsFor(food);
  // во время вхождения в дефицит цель на сегодня своя — она выше конечной и снижается по дням
  const { targets: safe, ramp } = targetsForToday(base, food.startISO, today, food.pace);
  const rated = Object.entries(a.ratings ?? {});
  const pool = filterRecipes(RECIPES, {
    ...food.constraints,
    bannedIds: rated.filter(([, v]) => v === -1).map(([id]) => id),
  });
  // Пустой набор — это НЕ «еда не подключена»: человек мог скрыть все блюда пальцем
  // вниз или выставить взаимоисключающие ограничения. Возвращаем день без приёмов,
  // чтобы экран показал разбор причины, а не предложил заполнить форму заново.
  const diagnosis = diagnosePool(pool, food.mealCount);
  const liked = rated.filter(([, v]) => v === 1).map(([id]) => id);
  const rhythm = { wakeMin: parseHM(a.wokeHM), bedMin: a.bedMin };
  // настройки у каждой даты свои — ровно те же, что строит вкладка «Еда»
  const optsOf = (iso: string) => dayOptsFor(food, iso, rhythm, liked, a.noCookDays);
  /*
   * День берётся из того же календарного плана, что и вкладка «Еда»: раньше здесь
   * номером дня служил день недели, а там — индекс в семидневке, и один и тот же
   * четверг показывал на двух экранах разную еду.
   */
  const planned = scheduleFor(today, pool, iso => targetsForToday(base, food.startISO, iso, food.pace).targets, optsOf);
  const dayOpts = { ...optsOf(today), offset: planned.offset, avoid: planned.avoid, ...(planned.leftover ? { leftover: planned.leftover } : {}) };
  const day = generateAdaptedDay(safe, pool, dayOpts, a.night);
  // то, что человек поменял руками на экране «Еда», должно стоять и здесь
  applySwaps(day, a.swaps?.[today], pool, safe, food.mealCount);
  // что поменялось из-за ночи — сравнение с днём после обычной ночи
  const changes = day.simplified ? nightChanges(generateAdaptedDay(safe, pool, dayOpts), day) : [];
  return { day, safe, diagnosis, ramp, changes };
}
