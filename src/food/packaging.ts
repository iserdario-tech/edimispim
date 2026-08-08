/**
 * Фасовки и кладовка.
 *
 * Задача из жизни: на завтрак нужно 100 г творога, а в магазине минимальная пачка 200 г.
 * Без учёта фасовок приложение просит купить «450 г творога» — в корзине такого нет,
 * человек берёт три пачки, а остаток каждый раз пропадает из виду и покупается заново.
 *
 * Здесь считается честно: сколько упаковок реально взять, сколько из этого останется
 * и что из остатка пойдёт в следующие дни. Остаток не выбрасывается из расчёта,
 * а живёт в «кладовке» и вычитается из следующей закупки.
 */

export interface Pack {
  /** Размер стандартной упаковки в тех же единицах, что и в рецепте. */
  size: number;
  /** Весовой товар: в магазине можно взять сколько угодно, округлять не нужно. */
  loose?: boolean;
  /** Через сколько дней остаток обычно портится. Без значения — хранится долго. */
  perishDays?: number;
}

/**
 * Типичные фасовки российских продуктовых. Не претендуют на точность конкретного магазина —
 * задача не угадать артикул, а не просить купить «450 г творога», которых не бывает.
 */
export const PACKS: Record<string, Pack> = {
  "творог 5%": { size: 200, perishDays: 5 },
  "творог мягкий": { size: 180, perishDays: 5 },
  "греческий йогурт": { size: 300, perishDays: 7 },
  "куриное филе": { size: 500, perishDays: 3 },
  "яйца": { size: 10 },
  "рис": { size: 900 },
  "гречка": { size: 800 },
  "булгур": { size: 350 },
  "киноа": { size: 300 },
  "овсяные хлопья": { size: 500 },
  // добавлено после проверки списка на телефоне: он просил «183.3 г макарон» и «52 г гранолы» —
  // так их не продают, а человек с таким списком идёт в магазин гадать
  "макароны": { size: 400 },
  "спагетти": { size: 400 },
  "лапша гречневая": { size: 300 },
  "гранола": { size: 300 },
  "рисовая мука": { size: 500 },
  "отруби овсяные": { size: 200 },
  "сыр твёрдый": { size: 200, perishDays: 14 },
  "тёмный шоколад 70%": { size: 90 },
  "сироп топинамбура": { size: 250 },
  "кукуруза консервированная": { size: 340 },
  "горошек зелёный замороженный": { size: 400, perishDays: 90 },
  "хлебцы": { size: 100 },
  "семена чиа": { size: 150 },
  "семена льна": { size: 200 },
  "кунжут": { size: 100 },
  "миндаль": { size: 150 },
  "кешью": { size: 150 },
  "изюм": { size: 200 },
  "курага": { size: 200 },
  "мука": { size: 1000 },
  "чечевица красная": { size: 400 },
  "нут консервированный": { size: 400 },
  "кус-кус": { size: 350 },
  "рис бурый": { size: 500 },
  "арахис": { size: 150 },
  "натуральный йогурт": { size: 350, perishDays: 7 },
  "паста тахини": { size: 300 },
  "оливки": { size: 300 },
  "вяленые томаты": { size: 200, perishDays: 30 },
  "кимчи": { size: 300, perishDays: 30 },
  "цельнозерновой хлеб": { size: 400, perishDays: 5 },
  "семена тыквы": { size: 150 },
  "чечевица": { size: 400 },
  "нут": { size: 400 },
  "какао-порошок": { size: 100 },
  "мёд": { size: 250 },
  "арахисовая паста": { size: 300 },
  "соевый соус": { size: 200 },
  "паста гочжан": { size: 200 },
  "паста мисо": { size: 300 },
  "харисса": { size: 100 },
  "томаты консервированные": { size: 400 },
  "фасоль консервированная": { size: 400 },
  "тунец консервированный": { size: 150 },
  "кокосовое молоко": { size: 400 },
  "ягоды замороженные": { size: 300, perishDays: 90 },
  "овощная смесь": { size: 400, perishDays: 90 },
  "сыр фета": { size: 200, perishDays: 7 },
  "пармезан": { size: 150, perishDays: 14 },
  "грецкие орехи": { size: 100 },
  "тофу": { size: 200, perishDays: 5 },
  "зелень": { size: 50, perishDays: 4 },
  "шпинат": { size: 200, perishDays: 4 },
  // весовое: берём ровно сколько нужно
  "банан": { size: 1, loose: true, perishDays: 5 },
  "морковь": { size: 1, loose: true, perishDays: 14 },
  "перец болгарский": { size: 1, loose: true, perishDays: 7 },
  "свежие овощи": { size: 1, loose: true, perishDays: 5 },
  "говядина": { size: 1, loose: true, perishDays: 3 },
  "свинина": { size: 1, loose: true, perishDays: 3 },
  "индейка": { size: 1, loose: true, perishDays: 3 },
  "лосось": { size: 1, loose: true, perishDays: 2 },
  "треска": { size: 1, loose: true, perishDays: 2 },
};

/** Специи и мелочь: их не покупают под рецепт, они просто есть на кухне. */
const STAPLES = /соль|перец чёрный|специи|зира|паприка|куркума|корица|чеснок|масло оливковое|масло растительное|уксус|сода|разрыхлитель|ванил/i;

export const isStaple = (name: string): boolean => STAPLES.test(name);

export function packOf(name: string): Pack {
  const key = name.toLowerCase().trim();
  if (PACKS[key]) return PACKS[key]!;
  // не знаем товар — считаем весовым: лучше попросить точное количество,
  // чем выдумать несуществующую фасовку
  return { size: 1, loose: true };
}

export interface BuyLine {
  name: string;
  unit: string;
  need: number;          // требуется по плану
  haveAtHome: number;    // сколько лежит дома (полностью, не обрезая до нужного)
  usedFromHome: number;  // сколько из этого уйдёт в готовку
  toBuy: number;         // не хватает
  packSize: number;
  packs: number;         // сколько упаковок брать (0 для весовых и для «всё есть дома»)
  buyAmount: number;     // сколько реально окажется куплено
  leftover: number;      // что останется после готовки
  loose: boolean;
  staple: boolean;
  perishDays?: number;   // через сколько дней остаток обычно портится
}

export type Pantry = Record<string, number>;   // «имя|единица» → остаток

const keyOf = (name: string, unit: string): string => `${name.toLowerCase().trim()}|${unit}`;

/**
 * Расчёт закупки с учётом того, что уже лежит дома.
 * Округление вверх до целой упаковки — потому что полпачки в магазине не продают.
 */
export function planPurchase(
  items: { name: string; unit: string; qty: number }[],
  pantry: Pantry = {},
): BuyLine[] {
  return items.map(it => {
    const staple = isStaple(it.name);
    const pack = packOf(it.name);
    // Дома может лежать БОЛЬШЕ, чем нужно, — тогда лишнее остаётся лежать дальше,
    // а не исчезает из расчёта. Обрезать запас до потребности было ошибкой.
    const haveAtHome = pantry[keyOf(it.name, it.unit)] ?? 0;
    const usedFromHome = Math.min(haveAtHome, it.qty);
    const toBuy = Math.max(0, +(it.qty - usedFromHome).toFixed(1));

    const packs = pack.loose || staple || toBuy === 0 ? 0 : Math.ceil(toBuy / pack.size);
    const buyAmount = packs > 0 ? packs * pack.size : toBuy;
    const leftover = +(haveAtHome + buyAmount - it.qty).toFixed(1);

    return {
      name: it.name, unit: it.unit,
      need: it.qty, haveAtHome, usedFromHome, toBuy,
      packSize: pack.size, packs, buyAmount,
      leftover: Math.max(0, leftover),
      loose: !!pack.loose, staple,
      ...(pack.perishDays !== undefined ? { perishDays: pack.perishDays } : {}),
    };
  });
}

/** Кладовка после закупки и готовки: остатки переезжают в следующую неделю. */
export function pantryAfter(lines: BuyLine[]): Pantry {
  const out: Pantry = {};
  for (const l of lines) {
    if (l.leftover > 0) out[keyOf(l.name, l.unit)] = l.leftover;
  }
  return out;
}

/**
 * Насколько блюдо собирается из того, что уже дома.
 *
 * Считаем по весу требуемого, а не по числу позиций: рецепт, где дома лежит соль и специи,
 * но нет курицы, «готов на 80 %» по позициям и на 5 % по делу. Специи и мелочь из счёта
 * выкинуты вовсе — они на кухне есть всегда, и учитывать их значит завышать готовность.
 */
export interface Coverage {
  /** Доля 0..1: сколько нужного лежит дома. */
  share: number;
  /** Чего не хватает — в порядке убывания важности (по весу). */
  missing: string[];
}

export function coverageOf(
  ingredients: { name: string; unit: string; qty: number }[],
  pantry: Pantry,
  servings = 1,
): Coverage {
  let need = 0, have = 0;
  const short: { name: string; gap: number }[] = [];
  for (const i of ingredients) {
    if (isStaple(i.name)) continue;
    const qty = i.qty * servings;
    if (qty <= 0) continue;
    const athome = Math.min(pantry[keyOf(i.name, i.unit)] ?? 0, qty);
    need += qty;
    have += athome;
    if (athome < qty) short.push({ name: i.name, gap: qty - athome });
  }
  short.sort((a, b) => b.gap - a.gap);
  return {
    share: need > 0 ? have / need : 0,
    missing: short.map(s => s.name),
  };
}

/** Сколько денег «уходит в остаток» — полезно понимать, что фасовки не бесплатны. */
export const leftoverShare = (lines: BuyLine[]): number => {
  const bought = lines.reduce((s, l) => s + l.buyAmount, 0);
  const left = lines.reduce((s, l) => s + l.leftover, 0);
  return bought > 0 ? left / bought : 0;
};
