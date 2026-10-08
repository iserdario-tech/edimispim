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

/** «meal» — полное блюдо с белком (котлета с пюре, плов с курицей): основа приёма, к ней только лёгкий гарнир. */
const PROTEIN_KINDS = new Set(["meat", "fish", "eggs", "meal"]);
const SIDE_KINDS = new Set(["grain", "veg", "salad", "soup"]);
const BREAKFAST_BASE = new Set(["cottage", "eggs", "porridge", "yogurt", "sandwich"]);
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

/** Чей белок: курица в обед и курица на ужин — не разнообразие, даже если блюда разные. */
export const animalOf = (name: string): string => {
  const n = name.toLowerCase();
  if (/индейк/.test(n)) return "turkey";
  if (/курин|куриц|цыпл|грудк/.test(n)) return "chicken";
  if (/говяд|телят/.test(n)) return "beef";
  if (/свин/.test(n)) return "pork";
  if (/печен[ьи]/.test(n)) return "liver";
  if (/рыб|лосос|форел|треск|тунц|горбуш|с[её]мг|минтай|кальмар|креветк|сельд|скумбр|судак|окун/.test(n)) return "fish";
  if (/омлет|яйц|яич/.test(n)) return "eggs";
  return "other";
};

/** Не больше `per` на ключ и не больше `max` всего, в исходном порядке. */
function spread<T>(list: T[], key: (x: T) => string, per: number, max: number): T[] {
  const n = new Map<string, number>(); const out: T[] = [];
  for (const x of list) {
    const k = key(x); const c = n.get(k) ?? 0;
    if (c >= per) continue;
    n.set(k, c + 1); out.push(x);
    if (out.length >= max) break;
  }
  return out;
}

/** На скольких человек собирается день: вдвоём упаковок больше, а «в меру» белка — на двоих. */
let persons = 1;

/** Варианты одной части приёма: товар и число упаковок, укладывающиеся в калории [lo, hi]. */
function parts(items: ReadyItem[], slot: Slot, lo: number, hi: number, used: Set<number>, kinds?: Set<string>, proteinMin = 0, families?: Set<string>): ReadyPart[] {
  const out: ReadyPart[] = [];
  // вдвоём упаковка либо пополам, либо каждому своя, либо по две: «1½ упаковки · по три четверти» никто не купит
  // основное блюдо — не больше упаковки на человека: «по две грудки каждому» никто не ест
  const steps = persons > 1 ? (MAIN_SLOTS.has(slot) ? [1, 2] : [1, 2, 4]) : [0.5, 1, 2];
  for (const it of items) {
    if (!it.slots.includes(slot) || used.has(it.xml_id) || families?.has(familyOf(it))) continue;
    if (kinds && !kinds.has(it.kind)) continue;
    // курица в обед — на ужин основа не из курицы (салат с курицей гарниром допустим: иначе ужину не из чего собраться)
    if (MAIN_SLOTS.has(slot) && PROTEIN_KINDS.has(it.kind) && animalOf(it.name) !== "other" && families?.has("animal:" + animalOf(it.name))) continue;
    // жирные блюда — не в обед и ужин; на завтраке омлет с сыром допустим, жиры дня держит оценка варианта
    if (MAIN_SLOTS.has(slot) && !fatOk(it)) continue;
    // хлебцы — всегда можно половину (пачка хранится), но не больше одной: четыре пачки хлебцев — не перекус
    for (const packs of it.kind === "bread" ? (persons > 1 ? [1] : [0.5, 1]) : it.grams >= HALF_FROM ? steps : steps.filter(x => Number.isInteger(x))) {
      if (it.grams * packs > GRAMS_MAX * persons) break;
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
    + (main ? Math.max(0, pr - PROTEIN_SWEET * persons) / (PROTEIN_SWEET * persons) * 0.6 : 0)
    + Math.max(0, fat / Math.max(1, k) - 0.3) * 2;
};

/** Все разумные варианты приёма, лучшие первыми. Основные — пара «белок + гарнир», завтрак — «основа + фрукт», иначе одно блюдо. */
function options(items: ReadyItem[], slot: Slot, target: number, used: Set<number>, families: Set<string>): ReadyPart[][] {
  const pmin = (PROTEIN_MIN[slot] ?? 0) * persons;
  const out: ReadyPart[][] = [];
  const main = MAIN_SLOTS.has(slot);
  // ужин легче обеда не фильтром здесь, а слотами каталога: паста, плов и рис размечены «только обед»
  const [baseKinds, addKinds] = main ? [PROTEIN_KINDS, SIDE_KINDS] : slot === "breakfast" ? [BREAKFAST_BASE, BREAKFAST_ADD] : [undefined, undefined];
  if (baseKinds && addKinds) {
    // основы — по две-три на тип (творог, яйца, каша, бутерброд) или семейство, иначе восьмёрка ближайших по
    // калориям оказывалась одними сэндвичами, и завтрак три дня подряд был одним и тем же
    const base = spread(parts(items, slot, target * 0.3, target * 0.8, used, baseKinds, main ? pmin * 0.75 : 0, families)
      .sort((a, b) => Math.abs(per(a, "kcal") - target * 0.55) - Math.abs(per(b, "kcal") - target * 0.55)), p => slot === "breakfast" ? p.item.kind : familyOf(p.item), 3, 12);
    // гарниры — клетчатка важна, но не десять паровых овощей подряд: по три на семейство, шестнадцать всего
    const add = spread(parts(items, slot, target * 0.15, target * 0.65, used, addKinds, 0, families)
      .filter(p => p.item.fat * 9 <= p.item.kcal * SIDE_FAT_MAX).sort((a, b) => b.item.fiber - a.item.fiber), p => familyOf(p.item), 3, 16);
    for (const b of base) for (const a of add) {
      if (b.item.xml_id === a.item.xml_id || familyOf(b.item) === familyOf(a.item)) continue;
      // к полному блюду (плов с курицей, котлета с пюре) — только овощи, салат или суп, а не вторая крупа
      if (b.item.kind === "meal" && a.item.kind === "grain") continue;
      // курица с курицей в одном приёме — тоже не разнообразие
      if (main && animalOf(b.item.name) !== "other" && animalOf(b.item.name) === animalOf(a.item.name)) continue;
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
  // семейства — чтобы день на день не приходился один тип (творог, творог, творог); внутри семейства —
  // до четырёх лучших, иначе «яйца» всегда значили один и тот же омлет
  const groups = new Map<string, ReadyPart[][]>();
  for (const o of list) {
    // завтрак чередуется по типу основы (творог, яйца, каша, йогурт, бутерброд), основные — по семейству блюда
    const fam = slot === "breakfast" ? o[0]!.item.kind : familyOf(o[0]!.item);
    if (!groups.has(fam)) { if (groups.size >= VARIETY) continue; groups.set(fam, []); }
    // внутри семейства — разные гарниры, иначе четыре варианта «филе» шли с одним и тем же боулом
    const g = groups.get(fam)!;
    if (g.length < 4 && !g.some(x => x[1] && o[1] && familyOf(x[1].item) === familyOf(o[1].item))) g.push(o);
  }
  const fams = [...groups.values()];
  if (!fams.length) return undefined;
  // не «offset % n»: при двух-трёх вариантах соседние дни попадали в один и тот же; хэш раскидывает ровнее
  const h = (Math.imul(offset, 2654435761) + i * 40503) >>> 0;
  const g = fams[h % fams.length]!;
  return g[(h >>> 8) % g.length];
};

/**
 * День из готовой еды. `targets` — цель на всех едоков вместе (на двоих — сумма целей), `people` — сколько их:
 * от этого зависят размеры упаковок и «в меру» белка. Блюда общие, делятся поровну.
 */
export function composeReadyDay(targets: Targets, count: MealCount, offset = 0, items: ReadyItem[] = READY.items, people = 1, chain = true): ReadyDay {
  persons = people;
  const shares = slotShares(count);
  const used = new Set<number>();
  const families = new Set<string>();   // «филе куриной» дважды в день — не разнообразие
  const picks: ReadyPick[] = [];
  const mark = (ps: ReadyPart[], on: boolean, slot: Slot) => ps.forEach(p => {
    const tags = [familyOf(p.item), ...(MAIN_SLOTS.has(slot) && PROTEIN_KINDS.has(p.item.kind) && animalOf(p.item.name) !== "other" ? ["animal:" + animalOf(p.item.name)] : [])];
    if (on) { used.add(p.item.xml_id); tags.forEach(t => families.add(t)); } else { used.delete(p.item.xml_id); tags.forEach(t => families.delete(t)); }
  });
  // вчерашние завтрак, обед и ужин сегодня не повторяются. «Вчера» — ровно тот день, который человек видел: цепочка
  // считается от якоря (каждый седьмой день), дальше каждый день смотрит на предыдущий. Якорный день смотрит на
  // «вчера» без его собственной оглядки — глубина не больше семи, расчёт миллисекунды, повтор возможен только на
  // стыке недель. Если без вчерашнего приём не собирается (маленький каталог) — берём как есть: повтор лучше пустого ужина.
  const avoid = new Set<number>();
  if (chain) {
    const anchor = ((offset % 7) + 7) % 7 === 0;
    for (const p of composeReadyDay(targets, count, offset - 1, items, people, !anchor).picks) if (p.slot !== "snack" && p.slot !== "dessert") p.parts.forEach(x => avoid.add(x.item.xml_id));
    persons = people;
  }
  const pool = () => avoid.size ? new Set([...used, ...avoid]) : used;
  // недобор или перебор прошлых приёмов переносится на следующий: так день сходится без переборки в конце
  let carry = 0;
  ORDER.forEach((slot, i) => {
    const share = shares[slot];
    if (!share) return;
    const want = targets.kcalTarget * share + carry;
    const chosen = take(options(items, slot, want, pool(), families), offset, i, slot) ?? (avoid.size ? take(options(items, slot, want, used, families), offset, i, slot) : undefined);
    if (!chosen) return;
    mark(chosen, true, slot);
    picks.push({ slot, parts: chosen });
    carry = want - kcalOf(chosen);
  });

  const dayKcal = () => picks.reduce((s, p) => s + kcalOf(p.parts), 0);
  const dayProtein = () => picks.reduce((s, p) => s + proteinOf(p.parts), 0);

  // подгонка под калории дня: приём, замена которого лучше всего гасит перекос, перебирается
  for (let guard = 0; guard < 6; guard++) {
    const dev = dayKcal() - targets.kcalTarget;
    if (Math.abs(dev) <= targets.kcalTarget * 0.08) break;
    const found: { idx: number; parts: ReadyPart[]; gain: number }[] = [];
    picks.forEach((p, idx) => {
      mark(p.parts, false, p.slot);
      const want = kcalOf(p.parts) - dev;
      for (const alt of options(items, p.slot, Math.max(want, targets.kcalTarget * (shares[p.slot] ?? 0.2) * 0.5), pool(), families).slice(0, VARIETY * 2)) {
        const gain = Math.abs(dev) - Math.abs(dev - kcalOf(p.parts) + kcalOf(alt));
        if (gain > 0) found.push({ idx, parts: alt, gain });
      }
      mark(p.parts, true, p.slot);
    });
    if (!found.length) break;
    // чиним тот приём, который дальше всех от своей доли, а не тот, где замена выгоднее всего:
    // иначе подгонка каждый день переставляла завтрак на один и тот же творог с хлебцами
    const devOf = (p: ReadyPick) => Math.abs(kcalOf(p.parts) - targets.kcalTarget * (shares[p.slot] ?? 0.2));
    const culprit = [...picks.keys()].filter(idx => found.some(f => f.idx === idx)).sort((a, b) => devOf(picks[b]!) - devOf(picks[a]!))[0]!;
    // четыре кандидата — четырёх разных семейств: иначе подгонка каждый день возвращала один и тот же омлет
    const good = spread(found.filter(f => f.idx === culprit).sort((a, b) => b.gain - a.gain), f => picks[culprit]!.slot === "breakfast" ? f.parts[0]!.item.kind : familyOf(f.parts[0]!.item), 1, 4);
    const b = good[(offset + guard) % good.length]!;
    mark(picks[b.idx]!.parts, false, picks[b.idx]!.slot); mark(b.parts, true, picks[b.idx]!.slot);
    picks[b.idx] = { slot: picks[b.idx]!.slot, parts: b.parts };
  }

  // белок дня ниже 85 % цели — самый слабый основной приём меняется на самый белковый из подходящих
  if (dayProtein() < targets.proteinGTarget * 0.85) {
    const mains = picks.map((p, idx) => ({ p, idx })).filter(x => (PROTEIN_MIN[x.p.slot] ?? 0) > 0)
      .sort((a, b) => proteinOf(a.p.parts) - proteinOf(b.p.parts));
    for (const { p, idx } of mains) {
      mark(p.parts, false, p.slot);
      // из четырёх самых белковых разных семейств — по хэшу дня, иначе добор каждый день ставил один и тот же омлет
      const best = spread(options(items, p.slot, targets.kcalTarget * (shares[p.slot] ?? 0.25), pool(), families).slice(0, VARIETY * 3)
        .sort((a, b) => proteinOf(b) - proteinOf(a)), o => p.slot === "breakfast" ? o[0]!.item.kind : familyOf(o[0]!.item), 1, 4);
      const alt = best.length ? best[((Math.imul(offset, 2654435761) + idx * 7919) >>> 0) % best.length] : undefined;
      if (!alt || proteinOf(alt) <= proteinOf(p.parts)) { mark(p.parts, true, p.slot); continue; }
      mark(alt, true, p.slot);
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
const PACKS: Record<string, string> = { "0.5": "½ упаковки", "1": "1 упаковка", "1.5": "1½ упаковки", "2": "2 упаковки", "3": "3 упаковки", "4": "4 упаковки" };
export const packsRU = (packs: number) => PACKS[String(packs)] ?? `${packs} упаковки`;
/** Сколько каждому, когда едоков двое: «по половине», «по одной», «по полторы». */
export const eachRU = (packs: number, people: number): string => {
  if (people < 2) return "";
  const e = packs / people;
  return e === 0.25 ? "по четверти каждому" : e === 0.5 ? "по половине каждому" : e === 0.75 ? "по три четверти каждому" : e === 1 ? "по одной каждому" : e === 1.5 ? "по полторы каждому" : e === 2 ? "по две каждому" : `по ${e} каждому`;
};
/** Что класть в корзину: упаковки — целиком, весовое — в килограммах (не меньше 100 г). */
export const cartOf = (day: ReadyDay) => {
  const q = new Map<number, number>();
  for (const p of day.picks) for (const part of p.parts) {
    const add = part.item.weighed ? part.packs * part.item.grams / 1000 : Math.ceil(part.packs);
    q.set(part.item.xml_id, (q.get(part.item.xml_id) ?? 0) + add);
  }
  return [...q.entries()].map(([xml_id, n]) => ({ xml_id, q: Math.max(0.1, Math.round(n * 100) / 100) }));
};
