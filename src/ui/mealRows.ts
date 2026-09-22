import type { Day, Meal, Slot } from "../food/types.js";
import { fmtHM } from "../time.js";
import { photoFor, photoUrl } from "../food/photos.js";

/**
 * Приёмы пищи → строки той же ленты суток, что и окна сна.
 *
 * Смысл продукта именно здесь: еда и сон не два раздела, а точки на одной оси времени.
 * Формат строки совпадает с тем, что отдаёт viewModel для сна, поэтому ленты просто сливаются.
 */
export interface TimelineRow {
  time: string;
  endTime?: string;
  icon: string;
  title: string;
  detail: string;
  why: string;
  past?: boolean;
  startMin: number;
  kind: "sleep" | "food";
  /** У строки еды — какой это приём: по нему вешается отметка «съел». */
  slot?: Slot;
  /** Фотография блюда. У строк сна её нет — там иконка. */
  photo?: string;
  /** «Завтрак», «Обед» — отдельной строкой над названием: в заголовке он съедал
   *  половину места и ломал название блюда на три строки. */
  kicker?: string;
  /** Сам приём — чтобы «Сегодня» открывал рецепт, не отправляя человека в «Еду». */
  meal?: Meal;
}

const ICON: Record<string, string> = {
  breakfast: "🍳", lunch: "🍲", dinner: "🍽️", dessert: "🍫", snack: "🥜",
};

const SLOT_RU: Record<string, string> = {
  breakfast: "Завтрак", lunch: "Обед", dinner: "Ужин", dessert: "Сладкое", snack: "Перекус",
};

/** Почему приём стоит именно здесь — коротко и без внутренних кодов. */
function whyRU(meal: Meal, bedMin: number): string {
  if (meal.slot === "dinner") {
    const hours = Math.round((bedMin - meal.timeMin) / 60);
    return `За ${hours} ч до отбоя — так легче держать дефицит и проще засыпать`;
  }
  if (meal.slot === "breakfast") return "Вскоре после подъёма — держит режим ровным";
  if (meal.slot === "dessert" || meal.slot === "snack") {
    if (meal.timeMin > bedMin - 240) {
      return "Перенесено на вечер: после плохой ночи это замена срыву, а не добавка";
    }
    // перекус бывает и солёным — хумус, наггетсы, капрезе; «сладкое» тут просто неправда
    return meal.slot === "snack"
      ? "Перекус вписан в норму дня — дефицит не ломается"
      : "Сладкое вписано в норму дня — дефицит не ломается";
  }
  return "Основная еда — в первой половине дня";
}

export function mealRows(day: Day, bedMin: number, nowMin: number): TimelineRow[] {
  return day.meals.map(m => {
    const kcal = Math.round(m.recipe.kcal * m.servings);
    const protein = Math.round(m.recipe.protein_g * m.servings);
    const portion = m.servings === 1 ? "" : ` · порция ×${m.servings}`;
    // остатки вчерашнего ужина: время готовки тут неправда — готовить не надо
    const time = m.leftover ? " · остатки вчерашнего ужина" : m.recipe.time_min ? ` · ${m.recipe.time_min} мин` : "";
    return {
      time: fmtHM(m.timeMin),
      icon: ICON[m.slot] ?? "🍴",
      kicker: SLOT_RU[m.slot] ?? "Еда",
      title: m.recipe.name,
      detail: `${kcal} ккал · белок ${protein} г${portion}${time}`,
      why: whyRU(m, bedMin),
      past: m.timeMin < nowMin,
      startMin: m.timeMin,
      kind: "food" as const,
      slot: m.slot,
      photo: photoUrl(photoFor(m.recipe)),
      meal: m,
    };
  });
}

/** Слить две ленты в одну по времени — это и есть «одни сутки» вместо двух приложений. */
export function mergeTimeline(sleepRows: TimelineRow[], foodRows: TimelineRow[]): TimelineRow[] {
  return [...sleepRows, ...foodRows].sort((a, b) => a.startMin - b.startMin);
}
