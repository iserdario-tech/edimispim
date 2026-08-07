import type { SafeTargets } from "./types";

/**
 * Плавное вхождение в дефицит.
 *
 * Повод — слова Сердара: «если я обжора, то с первого дня питаться на таком дефиците
 * это пиздец, надо неделю, чтоб плавно влиться». Он прав по сути: резкий переход от
 * привычной еды к целевому дефициту — самая частая причина бросить на первой неделе.
 *
 * Логика простая и честная: стартуем не от цели, а от ПОДДЕРЖИВАЮЩЕГО калоража (TDEE),
 * который движок и так считает, и спускаемся к цели равными шагами за выбранный срок.
 * В первый день человек ест примерно столько, сколько ел, — меняется не количество,
 * а структура: белок, клетчатка, время приёмов.
 *
 * Чего здесь СОЗНАТЕЛЬНО нет: обещания «так похудеешь быстрее». Наоборот — вход медленнее,
 * значит первые недели вес идёт медленнее. Плюс только в том, что дойти до конца шансов
 * больше. Так и надо говорить.
 */

export type RampPace = "gentle" | "normal" | "none";

/** Сколько дней занимает спуск к цели. */
export const RAMP_DAYS: Record<RampPace, number> = {
  gentle: 21,   // «мягко» — три недели
  normal: 14,   // «обычно» — две
  none: 0,      // «сразу» — для тех, кто уже в режиме
};

export const DEFAULT_PACE: RampPace = "normal";

export interface RampState {
  /** Какой сегодня день вхождения, начиная с 1. */
  day: number;
  /** Всего дней в лестнице. */
  total: number;
  /** Цель по калориям на сегодня. */
  kcalToday: number;
  /** Итоговая цель, к которой идём. */
  kcalGoal: number;
  /** Идёт ли вхождение прямо сейчас. */
  active: boolean;
  /** Одной строкой для интерфейса. */
  labelRU: string;
}

/** Сколько дней прошло с начала, включая сегодня (первый день — 1). */
function daysSince(startISO: string, todayISO: string): number {
  const a = Date.parse(startISO + "T00:00:00Z");
  const b = Date.parse(todayISO + "T00:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 1;
  return Math.floor((b - a) / 86_400_000) + 1;
}

/**
 * Цель по калориям на сегодня с учётом вхождения.
 *
 * Шаги равные: от TDEE до цели за `total` дней. На последнем дне и дальше — ровно цель.
 * Белок и клетчатка НЕ снижаются: они и есть то, ради чего всё затевается,
 * и на повышенном калораже добираются даже легче.
 */
export function rampIn(
  targets: SafeTargets, startISO: string | undefined, todayISO: string, pace: RampPace = DEFAULT_PACE,
): RampState {
  const total = RAMP_DAYS[pace];
  const goal = targets.kcalTarget;
  const from = Math.max(targets.tdee, goal);        // если TDEE почему-то ниже цели, спускаться некуда

  if (!startISO || total <= 0) {
    return { day: 0, total: 0, kcalToday: goal, kcalGoal: goal, active: false, labelRU: "" };
  }

  const day = daysSince(startISO, todayISO);
  if (day < 1) {
    return { day: 1, total, kcalToday: Math.round(from), kcalGoal: goal, active: true,
      labelRU: `Вход в режим: день 1 из ${total}` };
  }
  if (day > total) {
    return { day: total, total, kcalToday: goal, kcalGoal: goal, active: false, labelRU: "" };
  }

  // день 1 — поддерживающий калораж, день total — ровно цель, между ними равные шаги.
  // Делим на total - 1, а не на total: иначе последний день не доходил до цели.
  const share = total > 1 ? (day - 1) / (total - 1) : 1;
  const kcalToday = Math.round(from - (from - goal) * share);

  return {
    day, total, kcalToday, kcalGoal: goal, active: true,
    labelRU: `Вход в режим: день ${day} из ${total} · сегодня ${kcalToday} ккал, цель ${goal}`,
  };
}

/** Цели на сегодня: калории по лестнице, белок и клетчатка — как есть. */
export function targetsForToday(
  targets: SafeTargets, startISO: string | undefined, todayISO: string, pace: RampPace = DEFAULT_PACE,
): { targets: SafeTargets; ramp: RampState } {
  const ramp = rampIn(targets, startISO, todayISO, pace);
  if (!ramp.active) return { targets, ramp };
  return { targets: { ...targets, kcalTarget: ramp.kcalToday }, ramp };
}

/**
 * Какие блюда уместнее на этом этапе.
 *
 * В начале — привычная еда: паста, жаркое, запеканки, бутерброды. Это не отдельный набор
 * рецептов, а порог по плотности энергии: в начале допускаем блюда поплотнее, ближе к цели
 * набор смещается к более лёгким. Порог относительный, поэтому не ломается, когда рецепты
 * добавляют или убирают.
 *
 * Возвращает верхнюю границу ккал/100 г или `null`, если ограничивать не нужно.
 */
export function densityCeiling(ramp: RampState): number | null {
  if (!ramp.active || ramp.total <= 0) return null;
  const share = ramp.total > 1 ? (ramp.day - 1) / (ramp.total - 1) : 1;   // 0 в начале, 1 в конце
  // от 2.6 ккал/г в начале (обычная домашняя еда) до без ограничений в конце
  return share >= 0.7 ? null : 2.6 - share * 0.8;
}
