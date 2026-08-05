import { generateDay, type DayOptions } from "./planner";
import type { Day, Recipe, Targets } from "./types";

/**
 * Адаптация дня под вчерашнюю ночь.
 *
 * Что говорит наука (продуктовые выводы B1, B2):
 * - недосып поднимает потребление примерно на 253 ккал/д и смещает выбор к калорийно-плотному
 *   и сладкому (S-032, X3) — но КАЛОРАЖ ПОДНИМАТЬ НЕЛЬЗЯ, это сломает дефицит;
 * - недосып роняет тормозный контроль (g = −0.59) и рабочую память (g = −0.71) (X24) —
 *   значит надо снижать требуемое усилие, а не призывать держаться;
 * - расход энергии при этом НЕ падает (X5), поэтому цель по калориям не трогаем вовсе.
 */

/** Порог «плохой ночи». ponytail: один порог без градаций; калибровать на реальных данных. */
export const ROUGH_SLEEP_DEFICIT_MIN = 60;

export interface NightSummary {
  sleptMin?: number;            // фактическая длительность сна
  targetSleepMin?: number;      // цель из профиля сна
  quality?: 1 | 2 | 3 | 4 | 5;
}

export function isRoughNight(n: NightSummary | undefined): boolean {
  if (!n) return false;
  if (n.quality !== undefined && n.quality <= 2) return true;
  if (n.sleptMin !== undefined && n.targetSleepMin !== undefined) {
    return n.sleptMin < n.targetSleepMin - ROUGH_SLEEP_DEFICIT_MIN;
  }
  return false;
}

/** Цена приготовления: сначала сложность, при равной — время. */
const effort = (r: Recipe): number => (r.difficulty ?? 1) * 1000 + (r.time_min ?? 0);

/** Доля самых простых блюд каждого типа, которая остаётся в упрощённом дне. */
const EASY_FRACTION = 1 / 3;
const MIN_OPTIONS = 2;          // меньше двух — некуда заменять блюдо

/**
 * Сужает пул до самых простых блюд КАЖДОГО типа приёма.
 *
 * Критерий относительный, а не абсолютный («d1 и ≤20 мин»), потому что абсолютный порог
 * зависит от контента: в текущем наборе из 36 рецептов быстрых ужинов нет вовсе — самый
 * простой ужин занимает 25 минут. Относительный критерий работает на любом наборе и не
 * ломается, когда рецепты добавляют или убирают.
 */
export function simplifyPool(pool: Recipe[]): Recipe[] {
  const types = new Set(pool.map(r => r.meal_type));
  const out: Recipe[] = [];
  for (const t of types) {
    const ofType = pool.filter(r => r.meal_type === t).sort((a, b) => effort(a) - effort(b));
    const keep = Math.max(MIN_OPTIONS, Math.ceil(ofType.length * EASY_FRACTION));
    out.push(...ofType.slice(0, keep));
  }
  return out;
}

/**
 * День с учётом прошедшей ночи. После плохой ночи:
 * калораж тот же, блюда проще, калораж сдвинут вперёд, сладкое перенесено на вечер.
 */
export function generateAdaptedDay(
  targets: Targets, pool: Recipe[], opts: DayOptions, night?: NightSummary,
): Day {
  if (!isRoughNight(night)) return generateDay(targets, pool, opts);
  return generateDay(targets, simplifyPool(pool), { ...opts, roughNight: true });
}
