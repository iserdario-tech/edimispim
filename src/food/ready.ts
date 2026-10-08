import readyJson from "./data/ready.json";
import { slotShares } from "./planner";
import type { MealCount, Slot, Targets } from "./types";

/**
 * «День без готовки»: рацион дня из готовой еды ВкусВилла — то, что можно купить и сразу есть.
 *
 * Каталог собран скриптом `scripts/fetch-ready.py` из карточек магазина: вес упаковки и КБЖУ
 * на 100 г с этикетки. Клетчатки на этикетках нет — прикидка по типу блюда, в интерфейсе так
 * и подписано. День собирается под ту же цель, что и меню: доли приёмов те же (`slotShares`),
 * калории ±8 %, белок не ниже цели, жиры в основных блюдах не больше 40 % калорий.
 *
 * Обед и ужин — из двух частей: белковое (мясо, рыба, яйца) и гарнир (крупа, овощи, салат),
 * потому что «съесть одну грудку» — грустно (Сердар, 2026-10-08). Упаковку можно взять
 * наполовину: вторая половина — на завтра; в корзину она ложится целиком.
 * Набор детерминирован датой (`offset`), «другой набор» — следующий сдвиг.
 */
export interface ReadyItem {
  id: number; xml_id: number; name: string; grams: number;
  kcal: number; protein: number; fat: number; carbs: number; fiber: number;   // на 100 г
  price: number; slots: string[]; kind: string; url: string;
  /** Весовой товар (фрукты, овощи): `grams` — одна штука, цена за штуку; в корзину идёт вес в кг. */
  weighed?: boolean;
}
export const READY = readyJson as { date: string; source: string; items: ReadyItem[] };

/** Часть приёма: товар и сколько упаковок съесть (½, 1 или 2). */
export interface ReadyPart { item: ReadyItem; packs: number }
export interface ReadyPick { slot: Slot; parts: ReadyPart[] }
export interface ReadyDay {
  picks: ReadyPick[];
  /** Съеденное за день и цена за купленные упаковки (половинки — целиком). */
  totals: { kcal: number; protein: number; fat: number; carbs: number; fiber: number; price: number };
}

type Nutrient = "kcal" | "protein" | "fat" | "carbs" | "fiber";
const per = (p: ReadyPart, k: Nutrient) => (p.item[k] * p.item.grams * p.packs) / 100;
const kcalOf = (parts: ReadyPart[]) => parts.reduce((s, p) => s + per(p, "kcal"), 0);
const proteinOf = (parts: ReadyPart[]) => parts.reduce((s, p) => s + per(p, "protein"), 0);

const PROTEIN_KINDS = new Set(["meat", "fish", "eggs"]);
const SIDE_KINDS = new Set(["grain", "veg", "salad", "soup"]);
const BREAKFAST_BASE = new Set(["cottage", "eggs", "porridge", "yogurt"]);
const BREAKFAST_ADD = new Set(["fruit", "bread", "cottage", "yogurt"]);   // каша + творожок, омлет + фрукт
const MAIN_SLOTS = new Set<Slot>(["lunch", "dinner"]);
/** Белка в основном приёме «в меру»: больше — лишние калории из мяса вместо овощей и круп. */
const PROTEIN_SWEET = 35;
/** Гарнир — не майонезный салат: жиров не больше 35 % калорий. */
const SIDE_FAT_MAX = 0.35;
/** Белка в приёме для основных — чтобы день не собрался из каш и фруктов. */
const PROTEIN_MIN: Partial<Record<Slot, number>> = { breakfast: 10, lunch: 20, dinner: 20 };
/** Жиры в блюде — не больше 40 % калорий: салат под майонезом и жирные деликатесы остаются на полке. */
const FAT_SHARE_MAX = 0.4;
/** Больше этого в один приём не съесть: две пачки творога — не завтрак. */
const GRAMS_MAX = 450;
/** Половину упаковки берём только у заметной: полпачки йогурта на 150 г — не порция. */
const HALF_FROM = 200;
const VARIETY = 10;   // из скольких ближайших по калориям выбираем по дате
const ORDER: Slot[] = ["breakfast", "lunch", "dinner", "snack", "dessert"];

const fatOk = (it: ReadyItem) => it.fat * 9 <= it.kcal * FAT_SHARE_MAX;

/** «Семейство» блюда — первое слово названия: «Сэндвич с тунцом» и «Сэндвич ролл» в один день — это два сэндвича. */
export const familyOf = (it: ReadyItem) => it.name.toLowerCase().replace(/["«»]/g, "").split(/\s+/)[0] ?? it.name;

/** Варианты одной части приёма: товар и число упаковок, укладывающиеся в калории [lo, hi]. */
function parts(items: ReadyItem[], slot: Slot, lo: number, hi: number, used: Set<number>, kinds?: Set<string>, proteinMin = 0, families?: Set<string>): ReadyPart[] {
  const out: ReadyPart[] = [];
  for (const it of items) {
    if (!it.slots.includes(slot) || used.has(it.xml_id) || families?.has(familyOf(it))) continue;
    if (kinds && !kinds.has(it.kind)) continue;
    // жирные блюда — не в обед и ужин; на завтраке омлет с сыром допустим, жиры дня держит оценка варианта
    if (MAIN_SLOTS.has(slot) && !fatOk(it)) continue;
    for (const packs of it.grams >= HALF_FROM ? [0.5, 1, 2] : [1, 2]) {
      if (it.grams * packs > GRAMS_MAX) break;
      const p = { item: it, packs };
      const k = per(p, "kcal");
      if (k < lo) continue;
      if (k > hi) break;
      if (per(p, "protein") < proteinMin) continue;
      out.push(p);
      break;   // первая подходящая порция: меньше — честнее
    }
  }
  return out;
}

/**
 * Насколько вариант хорош: близость к калориям приёма, белок «в меру» (не гора мяса вместо овощей),
 * жиры не выше трети. Меньше — лучше. Это и есть «корректное КБЖУ для сброса веса», а не максимум белка.
 */
const score = (parts: ReadyPart[], target: number, main: boolean): number => {
  const k = kcalOf(parts), pr = proteinOf(parts);
  const fat = parts.reduce((s, p) => s + per(p, "fat"), 0) * 9;
  return Math.abs(k - target) / target
    + (main ? Math.max(0, pr - PROTEIN_SWEET) / PROTEIN_SWEET * 0.6 : 0)
    + Math.max(0, fat / Math.max(1, k) - 0.3) * 2;
};

/** Все разумные варианты приёма, лучшие первыми. Основные — пара «белок + гарнир», завтрак — «основа + фрукт», иначе одно блюдо. */
function options(items: ReadyItem[], slot: Slot, target: number, used: Set<number>, families: Set<string>): ReadyPart[][] {
  const pmin = PROTEIN_MIN[slot] ?? 0;
  const out: ReadyPart[][] = [];
  const main = MAIN_SLOTS.has(slot);
  const [baseKinds, addKinds] = main ? [PROTEIN_KINDS, SIDE_KINDS] : slot === "breakfast" ? [BREAKFAST_BASE, BREAKFAST_ADD] : [undefined, undefined];
  if (baseKinds && addKinds) {
    const base = parts(items, slot, target * 0.3, target * 0.8, used, baseKinds, main ? pmin * 0.75 : 0, families)
      .sort((a, b) => Math.abs(per(a, "kcal") - target * 0.55) - Math.abs(per(b, "kcal") - target * 0.55)).slice(0, 8);
    const add = parts(items, slot, target * 0.15, target * 0.65, used, addKinds, 0, families)
      .filter(p => p.item.fat * 9 <= p.item.kcal * SIDE_FAT_MAX).sort((a, b) => b.item.fiber - a.item.fiber).slice(0, 10);
    for (const b of base) for (const a of add) {
      if (b.item.xml_id === a.item.xml_id || familyOf(b.item) === familyOf(a.item)) continue;
      const pair = [b, a];
      if (kcalOf(pair) < target * 0.75 || kcalOf(pair) > target * 1.25 || proteinOf(pair) < pmin) continue;
      out.push(pair);
    }
  }
  // одно блюдо — когда пары нет (или приём не основной)
  if (!out.length) for (const p of parts(items, slot, target * 0.55, target * 1.45, used, undefined, pmin, families)) out.push([p]);
  return out.sort((a, b) => score(a, target, main) - score(b, target, main));
}

/** Из лучших — по одному на семейство первой части: иначе десятка лучших завтраков — десять творогов с хлебцами. */
const take = (list: ReadyPart[][], offset: number, i: number, slot: Slot): ReadyPart[] | undefined => {
  const seen = new Set<string>();
  const top: ReadyPart[][] = [];
  for (const o of list) {
    // завтрак чередуется по типу основы (творог, яйца, каша, йогурт), основные — по семейству блюда
    const fam = slot === "breakfast" ? o[0]!.item.kind : familyOf(o[0]!.item);
    if (seen.has(fam)) continue;
    seen.add(fam); top.push(o);
    if (top.length >= VARIETY) break;
  }
  // не «offset % n»: при двух-трёх вариантах соседние дни попадали в один и тот же; хэш раскидывает ровнее
  return top.length ? top[(Math.imul(offset, 2654435761) + i * 40503 >>> 0) % top.length] : undefined;
};

export function composeReadyDay(targets: Targets, count: MealCount, offset = 0, items: ReadyItem[] = READY.items): ReadyDay {
  const shares = slotShares(count);
  const used = new Set<number>();
  const families = new Set<string>();   // «филе куриной» дважды в день — не разнообразие
  const picks: ReadyPick[] = [];
  const mark = (ps: ReadyPart[], on: boolean) => ps.forEach(p => { on ? used.add(p.item.xml_id) : used.delete(p.item.xml_id); on ? families.add(familyOf(p.item)) : families.delete(familyOf(p.item)); });
  // недобор или перебор прошлых приёмов переносится на следующий: так день сходится без переборки в конце
  let carry = 0;
  ORDER.forEach((slot, i) => {
    const share = shares[slot];
    if (!share) return;
    const want = targets.kcalTarget * share + carry;
    const chosen = take(options(items, slot, want, used, families), offset, i, slot);
    if (!chosen) return;
    mark(chosen, true);
    picks.push({ slot, parts: chosen });
    carry = want - kcalOf(chosen);
  });

  const dayKcal = () => picks.reduce((s, p) => s + kcalOf(p.parts), 0);
  const dayProtein = () => picks.reduce((s, p) => s + proteinOf(p.parts), 0);

  // подгонка под калории дня: приём, замена которого лучше всего гасит перекос, перебирается
  for (let guard = 0; guard < 4; guard++) {
    const dev = dayKcal() - targets.kcalTarget;
    if (Math.abs(dev) <= targets.kcalTarget * 0.08) break;
    const found: { idx: number; parts: ReadyPart[]; gain: number }[] = [];
    picks.forEach((p, idx) => {
      mark(p.parts, false);
      const want = kcalOf(p.parts) - dev;
      for (const alt of options(items, p.slot, Math.max(want, targets.kcalTarget * (shares[p.slot] ?? 0.2) * 0.5), used, families).slice(0, VARIETY)) {
        const gain = Math.abs(dev) - Math.abs(dev - kcalOf(p.parts) + kcalOf(alt));
        if (gain > 0) found.push({ idx, parts: alt, gain });
      }
      mark(p.parts, true);
    });
    if (!found.length) break;
    // чиним тот приём, который дальше всех от своей доли, а не тот, где замена выгоднее всего:
    // иначе подгонка каждый день переставляла завтрак на один и тот же творог с хлебцами
    const devOf = (p: ReadyPick) => Math.abs(kcalOf(p.parts) - targets.kcalTarget * (shares[p.slot] ?? 0.2));
    const culprit = [...picks.keys()].filter(idx => found.some(f => f.idx === idx)).sort((a, b) => devOf(picks[b]!) - devOf(picks[a]!))[0]!;
    const good = found.filter(f => f.idx === culprit).sort((a, b) => b.gain - a.gain).slice(0, 4);
    const b = good[(offset + guard) % good.length]!;
    mark(picks[b.idx]!.parts, false); mark(b.parts, true);
    picks[b.idx] = { slot: picks[b.idx]!.slot, parts: b.parts };
  }

  // белок дня ниже 85 % цели — самый слабый основной приём меняется на самый белковый из подходящих
  if (dayProtein() < targets.proteinGTarget * 0.85) {
    const mains = picks.map((p, idx) => ({ p, idx })).filter(x => (PROTEIN_MIN[x.p.slot] ?? 0) > 0)
      .sort((a, b) => proteinOf(a.p.parts) - proteinOf(b.p.parts));
    for (const { p, idx } of mains) {
      mark(p.parts, false);
      const alt = options(items, p.slot, targets.kcalTarget * (shares[p.slot] ?? 0.25), used, families).slice(0, VARIETY * 2)
        .sort((a, b) => proteinOf(b) - proteinOf(a))[0];
      if (!alt || proteinOf(alt) <= proteinOf(p.parts)) { mark(p.parts, true); continue; }
      mark(alt, true);
      picks[idx] = { slot: p.slot, parts: alt };
      if (dayProtein() >= targets.proteinGTarget * 0.85) break;
    }
  }

  const totals = { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0, price: 0 };
  for (const p of picks) for (const part of p.parts) {
    totals.kcal += per(part, "kcal"); totals.protein += per(part, "protein"); totals.fat += per(part, "fat");
    totals.carbs += per(part, "carbs"); totals.fiber += per(part, "fiber"); totals.price += part.item.price * Math.ceil(part.packs);
  }
  for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] = Math.round(totals[k]);
  return { picks, totals };
}

/** Подписи для списка. */
export const partKcal = (p: ReadyPart) => Math.round(per(p, "kcal"));
export const partProtein = (p: ReadyPart) => Math.round(per(p, "protein"));
export const packsRU = (packs: number) => packs === 0.5 ? "½ упаковки" : packs === 1 ? "1 упаковка" : `${packs} упаковки`;
/** Что класть в корзину: упаковки — целиком, весовое — в килограммах (не меньше 100 г). */
export const cartOf = (day: ReadyDay) => {
  const q = new Map<number, number>();
  for (const p of day.picks) for (const part of p.parts) {
    const add = part.item.weighed ? part.packs * part.item.grams / 1000 : Math.ceil(part.packs);
    q.set(part.item.xml_id, (q.get(part.item.xml_id) ?? 0) + add);
  }
  return [...q.entries()].map(([xml_id, n]) => ({ xml_id, q: Math.max(0.1, Math.round(n * 100) / 100) }));
};
