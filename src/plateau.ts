import type { DayRecord } from "./day-log.js";
import { sleepDurationMin } from "./readiness.js";

/**
 * Плато: вес стоит — почему?
 *
 * Самая частая причина бросить программу — «я всё делаю, а вес не идёт». Ответ требует
 * ДВУХ рядов сразу: приверженности плану и сна. pospat видит только сон, oheedet — только еду;
 * ни один не может отличить «еда течёт» от «сон течёт».
 *
 * ⚠️ Это НЕ статистический вывод (`H4`). Ряд короткий, условия не рандомизированы,
 * конфаундеров десятки. Поэтому вердикт формулируется как «на что посмотреть»,
 * а не как диагноз, и никаких коэффициентов наружу не выходит.
 */

export type PlateauCause = "no_data" | "not_plateau" | "food" | "sleep" | "both" | "keep_waiting";

export interface PlateauResult {
  cause: PlateauCause;
  weeks: number;                 // сколько недель вес практически не двигается
  messageRU: string;
}

/** Меньше этого изменения за период считаем «стоит»: обычные колебания воды больше. */
const FLAT_KG = 0.4;
const MIN_DAYS = 14;
const MIN_WEIGHTS = 3;

const DAY_MS = 86_400_000;
const daysBetween = (a: string, b: string): number =>
  Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);

export function plateau(days: DayRecord[], targetSleepMin: number): PlateauResult {
  const weights = days.filter(d => typeof d.body?.weightKg === "number");
  if (weights.length < MIN_WEIGHTS) {
    return { cause: "no_data", weeks: 0, messageRU: "" };
  }

  const first = weights[0]!;
  const last = weights[weights.length - 1]!;
  // период считаем ВКЛЮЧИТЕЛЬНО: 14 отметок подряд — это две недели наблюдения,
  // хотя разница между крайними датами всего 13 дней
  const span = daysBetween(first.date, last.date) + 1;
  if (span < MIN_DAYS) return { cause: "no_data", weeks: 0, messageRU: "" };

  const change = first.body!.weightKg! - last.body!.weightKg!;
  if (change > FLAT_KG) {
    return { cause: "not_plateau", weeks: 0, messageRU: "" };   // вес идёт вниз — не плато
  }

  const weeks = Math.round(span / 7);
  const window = days.filter(d => daysBetween(first.date, d.date) >= 0);

  // Сон: сколько ночей за период недобирали больше часа
  const nights = window.filter(d => d.sleep?.bedHM);
  const shortNights = nights.filter(d =>
    sleepDurationMin({ wokeHM: d.sleep!.wokeHM, bedHM: d.sleep!.bedHM, quality: d.sleep!.quality }, targetSleepMin)
      < targetSleepMin - 60).length;
  const sleepLeaks = nights.length >= 4 && shortNights / nights.length >= 0.4;

  // Еда: доля дней, отмеченных как «съел по плану»
  const marked = window.filter(d => d.food?.followed !== undefined);
  const followed = marked.filter(d => d.food!.followed).length;
  const foodLeaks = marked.length >= 4 && followed / marked.length < 0.6;

  if (sleepLeaks && foodLeaks) {
    return {
      cause: "both", weeks,
      messageRU: `Вес стоит ${weeks} недел${weeks === 1 ? "ю" : weeks < 5 ? "и" : "ь"}. За это время недобор сна был больше чем в трети ночей, и по плану еды прошло меньше половины дней. Начинать проще со сна: на недосыпе план еды сам собой становится тяжелее.`,
    };
  }
  if (sleepLeaks) {
    return {
      cause: "sleep", weeks,
      messageRU: `Вес стоит ${weeks} недел${weeks === 1 ? "ю" : weeks < 5 ? "и" : "ь"}, при этом еда идёт по плану, а сон — нет. Стоит посмотреть в сторону сна: недосып поднимает аппетит и роняет самоконтроль, даже когда меню не меняется.`,
    };
  }
  if (foodLeaks) {
    return {
      cause: "food", weeks,
      messageRU: `Вес стоит ${weeks} недел${weeks === 1 ? "ю" : weeks < 5 ? "и" : "ь"}. Сон в порядке, а вот по плану еды прошло меньше половины дней — похоже, дело в этом. Может, план слишком плотный: попробуй схему попроще.`,
    };
  }
  return {
    cause: "keep_waiting", weeks,
    messageRU: `Вес стоит ${weeks} недел${weeks === 1 ? "ю" : weeks < 5 ? "и" : "ь"}, но и сон, и еда идут ровно. Так бывает: вода и цикл легко прячут пару килограммов. Ничего не меняй ещё неделю — скорее всего, сдвинется само.`,
  };
}
