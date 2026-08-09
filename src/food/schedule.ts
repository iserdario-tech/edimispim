import { generateDay, type DayOptions } from "./planner";
import type { Day, Recipe, Targets } from "./types";

/**
 * Меню, привязанное к календарю, а не к позиции в списке.
 *
 * До этого «какое блюдо сегодня» определял порядковый номер дня в том куске, который
 * рисовал экран. На «Сегодня» это был день недели, на «Еде» — индекс в семидневке,
 * и получались две беды сразу.
 *
 * Во-первых, экраны спорили друг с другом: одна и та же среда показывала на «Сегодня»
 * гречку по-купечески, а на «Еде» — овсянку. Совпадали они только по воскресеньям,
 * когда номер дня недели случайно равен нулю.
 *
 * Во-вторых, план не держал слово. Сегодняшнее «завтра — гречка с яйцом» назавтра
 * становилось «днём номер ноль» и превращалось в ту же овсянку, что и вчера. Человек
 * каждый день видел один и тот же первый день, а список покупок был собран под меню,
 * которое никогда не наступит целиком. Отсюда и ощущение «еда каждый день одна и та же»
 * при трёх сотнях рецептов в базе.
 *
 * Здесь номер дня считается от эпохи, а не от края экрана, и семидневки нарезаны по
 * календарю. Дата определяет меню однозначно: что обещано на четверг, то в четверг и будет.
 */

const MS_DAY = 86_400_000;

/** Номер дня от эпохи. Дата разбирается как UTC — иначе номер зависел бы от часового пояса. */
export const dayNumber = (iso: string): number => Math.floor(Date.parse(iso + "T00:00:00Z") / MS_DAY);
export const isoOfDay = (n: number): string => new Date(n * MS_DAY).toISOString().slice(0, 10);

export interface ScheduledDay {
  iso: string;
  day: Day;
  /** Цель этого дня: во время входа в режим она у каждого дня своя. */
  targets: Targets;
  /** Что передать планировщику, чтобы получить ровно этот день (нужно для адаптации под сон). */
  offset: number;
  avoid: string[];
}

type DayOpts = Omit<DayOptions, "offset" | "avoid">;

/**
 * Семидневный блок, в который попадает дата. Блоки нарезаны от эпохи, поэтому у каждой
 * даты он один и тот же независимо от того, когда мы смотрим.
 */
export function planBlock(
  iso: string, pool: Recipe[],
  targetsOf: (iso: string) => Targets,
  optsOf: (iso: string) => DayOpts,
): ScheduledDay[] {
  const start = Math.floor(dayNumber(iso) / 7) * 7;
  const out: ScheduledDay[] = [];
  /*
   * Стык двух блоков даёт в скользящем окне один-три повтора за неделю. Пробовал гасить
   * их, подмешивая сюда предыдущий блок: замер показал, что выигрыша нет — где-то на день
   * лучше, где-то на два хуже, а счёт вдвое дороже. Осталось как есть.
   */
  const avoid: string[] = [];
  for (let i = 0; i < 7; i++) {
    const n = start + i;
    const date = isoOfDay(n);
    const targets = targetsOf(date);
    const taken = [...avoid];
    const day = generateDay(targets, pool, { ...optsOf(date), offset: n, avoid: taken });
    out.push({ iso: date, day, targets, offset: n, avoid: taken });
    for (const m of day.meals) avoid.push(m.recipe.id);
  }
  return out;
}

/** Меню одной даты. */
export function scheduleFor(
  iso: string, pool: Recipe[],
  targetsOf: (iso: string) => Targets,
  optsOf: (iso: string) => DayOpts,
): ScheduledDay {
  return planBlock(iso, pool, targetsOf, optsOf).find(d => d.iso === iso)!;
}

/**
 * Окно из `count` дней, начиная с даты: то, что показывает экран «Еда».
 *
 * Окно скользит по календарю и может задевать два блока — семь ближайших дней полезнее
 * календарной недели, где список покупок на прошедший вторник уже никому не нужен.
 */
export function planWindow(
  startISO: string, count: number, pool: Recipe[],
  targetsOf: (iso: string) => Targets,
  optsOf: (iso: string) => DayOpts,
): ScheduledDay[] {
  const out: ScheduledDay[] = [];
  let cursor = startISO;
  while (out.length < count) {
    const block = planBlock(cursor, pool, targetsOf, optsOf);
    const from = block.findIndex(d => d.iso === cursor);
    for (let i = from; i < block.length && out.length < count; i++) out.push(block[i]!);
    cursor = isoOfDay(dayNumber(block[block.length - 1]!.iso) + 1);
  }
  return out;
}
