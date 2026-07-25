import type { DayRecord } from "./day-log.js";

/**
 * Один следующий шаг — вместо пустых экранов и молчания.
 *
 * Приложение копит смысл постепенно: пока нет ночей, нечего сопоставлять; пока нет веса,
 * нечего сказать про состав потери. Вместо того чтобы показывать пустые графики и нули,
 * честно говорим, чего не хватает и что это даст.
 *
 * Сознательно ОДИН шаг за раз: список из пяти задач на старте отпугивает сильнее, чем помогает.
 */

export interface NextStep {
  id: "setup_food" | "log_nights" | "log_weekend" | "add_weight" | "keep_going";
  titleRU: string;
  whyRU: string;
  done: number;                  // сколько уже есть
  need: number;                  // сколько нужно, чтобы шаг закрылся
}

const NIGHTS_FOR_TREND = 4;      // меньше — статистики нет даже для взгляда
const WEIGHTS_FOR_TREND = 2;     // одна точка — не линия

const isWeekend = (iso: string): boolean => {
  const dow = new Date(iso + "T00:00:00Z").getUTCDay();
  return dow === 0 || dow === 6;
};

export function nextStep(days: DayRecord[], hasFood: boolean): NextStep {
  const nights = days.filter(d => d.sleep);
  const weekendNights = nights.filter(d => isWeekend(d.date));
  const weights = days.filter(d => typeof d.body?.weightKg === "number");

  if (!hasFood) {
    return {
      id: "setup_food", done: 0, need: 1,
      titleRU: "Заполни короткую форму про еду",
      whyRU: "Тогда появится меню, а ужин встанет за три часа до твоего отбоя.",
    };
  }

  if (nights.length < NIGHTS_FOR_TREND) {
    return {
      id: "log_nights", done: nights.length, need: NIGHTS_FOR_TREND,
      titleRU: `Отметь ещё ${NIGHTS_FOR_TREND - nights.length} ноч${plural(NIGHTS_FOR_TREND - nights.length)}`,
      whyRU: "С четырёх ночей уже видно, ровно ли держится режим — а он связан с результатом не меньше самой диеты.",
    };
  }

  if (weekendNights.length < 2) {
    return {
      id: "log_weekend", done: weekendNights.length, need: 2,
      titleRU: "Отметь пару выходных",
      whyRU: "Без них не видно, насколько разъезжается режим между буднями и выходными.",
    };
  }

  if (weights.length < WEIGHTS_FOR_TREND) {
    return {
      id: "add_weight", done: weights.length, need: WEIGHTS_FOR_TREND,
      titleRU: "Запиши вес",
      whyRU: "С двух замеров смогу сказать не только сколько ушло, но и что именно уходит.",
    };
  }

  return {
    id: "keep_going", done: nights.length, need: nights.length,
    titleRU: "Просто продолжай отмечать",
    whyRU: "Чем длиннее ряд, тем точнее видно связь между сном, едой и весом.",
  };
}

const plural = (n: number): string => (n === 1 ? "ь" : n < 5 ? "и" : "ей");
