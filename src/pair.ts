/**
 * «Готовим вдвоём» — чистая логика без сети.
 *
 * Меню общее: его задаёт тот, кто создал пару, и партнёру оно приходит как набор ручных
 * замен (дата → приём → блюдо). Планировщик партнёра собирает те же блюда, но порции —
 * под его калории; блюда, которого нет в его наборе (аллергия, «пальцем вниз»), он не возьмёт.
 */
export type PairMenu = Record<string, Record<string, string>>;

export function menuOf(days: { date: string; day: { meals: { slot: string; recipe: { id: string } }[] } }[]): PairMenu {
  return Object.fromEntries(days.map(d => [d.date, Object.fromEntries(d.day.meals.map(m => [m.slot, m.recipe.id]))]));
}

/** Меню пары, а поверх — собственные замены партнёра: свой ужин он может поменять. */
export function mergeSwaps(pair: PairMenu | undefined, own: PairMenu | undefined): PairMenu {
  if (!pair) return own ?? {};
  const out: PairMenu = { ...pair };
  for (const [date, s] of Object.entries(own ?? {})) out[date] = { ...(out[date] ?? {}), ...s };
  return out;
}

/**
 * Замены блюд обоих: каждый отправляет свои с временем, на один приём побеждает более поздняя.
 * Кто бы ни нажал ↻ — у обоих стоит одно блюдо.
 */
export type PairSwaps = Record<string, Record<string, [id: string, ts: number]>>;

export function withPartnerSwaps(swaps: PairMenu | undefined, mine: PairSwaps = {}, theirs: PairSwaps = {}): PairMenu {
  const out: PairMenu = { ...swaps };
  for (const [date, s] of Object.entries(theirs)) {
    for (const [slot, [id, ts]] of Object.entries(s)) {
      if ((mine[date]?.[slot]?.[1] ?? 0) < ts) out[date] = { ...(out[date] ?? {}), [slot]: id };
    }
  }
  return out;
}

/** Стоит ли в этом приёме блюдо, которое выбрал партнёр, — для подписи в меню. */
export function byPartner(date: string, slot: string, id: string, mine: PairSwaps = {}, theirs: PairSwaps = {}): boolean {
  const t = theirs[date]?.[slot];
  return !!t && t[0] === id && (mine[date]?.[slot]?.[1] ?? 0) < t[1];
}

/**
 * Во сколько раз продуктов больше, чем на мою порцию: 1 + калории партнёра / мои.
 * Шаг 0.05 — точнее весы на кухне не нужны. Нет данных — как будто порции равны.
 * ponytail: одна пропорция на всю неделю — по дням цели почти не отличаются.
 */
export function pairFactor(ownKcal: number, otherKcal: number | undefined): number {
  if (!otherKcal || !ownKcal) return 2;
  const f = 1 + otherKcal / ownKcal;
  return Math.min(3, Math.max(1.3, Math.round(f * 20) / 20));
}
