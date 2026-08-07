import type { Day, Meal, Slot } from "../food/types.js";
import { fmtHM } from "../time.js";

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
    return meal.timeMin > bedMin - 240
      ? "Перенесено на вечер: после плохой ночи это замена срыву, а не добавка"
      : "Сладкое вписано в норму дня — дефицит не ломается";
  }
  return "Основная еда — в первой половине дня";
}

export function mealRows(day: Day, bedMin: number, nowMin: number): TimelineRow[] {
  return day.meals.map(m => {
    const kcal = Math.round(m.recipe.kcal * m.servings);
    const protein = Math.round(m.recipe.protein_g * m.servings);
    const portion = m.servings === 1 ? "" : ` · порция ×${m.servings}`;
    const time = m.recipe.time_min ? ` · ${m.recipe.time_min} мин` : "";
    return {
      time: fmtHM(m.timeMin),
      icon: ICON[m.slot] ?? "🍴",
      title: `${SLOT_RU[m.slot] ?? "Еда"}: ${m.recipe.name}`,
      detail: `${kcal} ккал · белок ${protein} г${portion}${time}`,
      why: whyRU(m, bedMin),
      past: m.timeMin < nowMin,
      startMin: m.timeMin,
      kind: "food" as const,
      slot: m.slot,
    };
  });
}

/** Слить две ленты в одну по времени — это и есть «одни сутки» вместо двух приложений. */
export function mergeTimeline(sleepRows: TimelineRow[], foodRows: TimelineRow[]): TimelineRow[] {
  return [...sleepRows, ...foodRows].sort((a, b) => a.startMin - b.startMin);
}
