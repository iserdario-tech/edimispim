import { generateDay, effortOf, type DayOptions } from "./planner";
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

/**
 * Цена приготовления берётся из планировщика — там же ею пользуется выбор блюда дня.
 *
 * Раньше сложность стояла множителем 1000 и время не значило ничего: жаркое на полтора часа
 * с difficulty 1 считалось «простым» и опережало 10-минутное блюдо посложнее. Пока рецептов
 * было мало, это не всплывало; на 81 рецепте упрощённый день стал ДЛИННЕЕ обычного.
 */
const effort = effortOf;

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

/**
 * Что именно поменялось в дне из-за ночи — словами, по пунктам.
 *
 * Главное отличие приложения — еда подстраивается под сон, — а увидеть его было нельзя:
 * после плохой ночи появлялась метка «упрощён», и человек не знал, что конкретно
 * изменилось и зачем. Здесь — сравнение с тем днём, который был бы после обычной ночи.
 */
const fmt = (min: number): string => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const kcalOf = (d: Day, slot: string) =>
  d.meals.filter(m => m.slot === slot).reduce((s, m) => s + m.recipe.kcal * m.servings, 0);
const avgCook = (d: Day) => {
  const mains = d.meals.filter(m => ["breakfast", "lunch", "dinner"].includes(m.slot) && !m.leftover);
  return mains.length ? mains.reduce((s, m) => s + (m.recipe.time_min ?? 0), 0) / mains.length : 0;
};

export function nightChanges(normal: Day, adapted: Day): string[] {
  const out: string[] = [];
  const was = normal.meals.find(m => m.slot === "dessert")?.timeMin;
  const now = adapted.meals.find(m => m.slot === "dessert")?.timeMin;
  if (was !== undefined && now !== undefined && now - was >= 30) {
    out.push(`Сладкое — на вечер: ${fmt(now)} вместо ${fmt(was)}. Запланированное сладкое вечером — замена срыву, а не добавка`);
  }
  // сдвиг заметен, если ужин потерял хотя бы двадцатую часть дня
  const day = Math.max(1, adapted.totals.kcal);
  if ((kcalOf(normal, "dinner") - kcalOf(adapted, "dinner")) / day >= 0.05) {
    out.push("Калории сдвинуты к утру: ужин меньше, завтрак и обед больше — за день столько же");
  }
  const before = avgCook(normal), after = avgCook(adapted);
  if (before - after >= 5) {
    out.push(`Блюда проще: в среднем ${Math.round(after)} мин готовки вместо ${Math.round(before)}`);
  }
  return out;
}
