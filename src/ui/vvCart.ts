import type { BuyLine } from "../food/packaging.js";
import { gramsOf } from "../food/nutrients.js";
import { readLS, writeLS } from "./localStore.js";
import { BACKEND_URL } from "./notifications.js";

/**
 * Корзина ВкусВилла из списка покупок — через открытый MCP магазина (без авторизации).
 * Запросы идут через наш воркер (`/vv`): напрямую из браузера сервер магазина не отвечает на preflight.
 *
 * Для каждой строки списка ищется карточка товара тем же способом, что снимает цены
 * `scripts/fetch-prices.py`: продукт в первых двух словах названия, переработка отсеяна,
 * из подходящих — самая дешёвая за 100 г. Упаковок берётся столько, чтобы хватило; весовой
 * товар — в килограммах. Ссылка на корзину открывается на сайте магазина, оттуда — заказ.
 *
 * Совпадения запоминаются на месяц: во второй раз корзина собирается мгновенно.
 */
export const VV_MCP = "https://mcp001.vkusvill.ru/mcp";
const CACHE_KEY = "edimispim.vv";
const CACHE_DAYS = 30;
const PAUSE_MS = 1100;   // у сервера 60 запросов в минуту

export interface VVMatch { xml_id: number; name: string; grams: number; weighed: boolean; price: number }
interface VVItem { xml_id: number; name: string; unit: string; price?: { current?: number } }

/** Как спрашивать магазин, если название в базе — не то, что на ценнике. */
const QUERY: Record<string, string> = {
  "яйца": "яйца куриные", "яичные белки": "яичный белок", "зелень": "укроп", "овощная смесь": "смесь овощная замороженная",
  "куриное филе": "филе грудки цыпленка", "индейка филе": "филе индейки", "филе лосося": "семга филе", "манная крупа": "манная", "перловка": "перловая", "бедро куриное": "бедро куриное",
  "говядина нежирная": "говядина", "свинина нежирная": "свинина", "филе трески": "треска филе",
  "минтай": "минтай филе", "лук": "лук репчатый", "помидор": "томаты", "томаты": "томаты", "черри-томаты": "томаты черри",
  "перец болгарский": "перец сладкий", "масло растительное": "масло подсолнечное", "сыр твёрдый": "сыр полутвёрдый",
  "хлеб белый": "хлеб пшеничный", "цельнозерновой хлеб": "хлеб цельнозерновой", "фарш смешанный": "фарш домашний",
  "молоко": "молоко 2,5%", "натуральный йогурт": "йогурт натуральный", "грибы шампиньоны": "шампиньоны",
  "томаты консервированные": "томаты в собственном соку", "стручковая фасоль": "фасоль стручковая",
  "горошек зелёный замороженный": "горошек зелёный замороженный", "овсяные хлопья": "хлопья овсяные",
  "сухари панировочные": "сухари панировочные", "панировочные сухари": "сухари панировочные", "мука": "мука пшеничная",
  "кукурузный крахмал": "крахмал кукурузный", "семена чиа": "чиа", "кунжут": "кунжут",
  "паста тахини": "тахини", "паста гочжан": "кочудян", "паста мисо": "мисо", "соус песто": "песто", "соус терияки": "терияки",
  "тёмный шоколад 70%": "шоколад горький", "какао-порошок": "какао", "арахисовая паста": "паста арахисовая",
  "булочка для бургера": "булочки для бургеров", "тортилья пшеничная": "тортилья", "грудинка свиная": "грудинка",
  "куриные крылья": "крылья куриные", "огурец солёный": "огурцы солёные", "капуста квашеная": "капуста квашеная",
  "квашеная капуста": "капуста квашеная", "карри порошок": "карри", "мандарин": "мандарины", "банан замороженный": "банан",
};
// переработка: по запросу «банан» магазин отдаёт конфеты и торты — это другой продукт
const STOP = /торт|конфет|чипс|вялен|сушён|(?<![а-яё])сок(?![а-яё])|нектар|смузи|пирог|печень[еяи]|десерт|мороженое|паштет|салат|котлет|пицц|пельмен|набор|подарочн|корм|сироп|варенье|джем|батончик|крем|соус|снек|сухарик|кекс|маффин|вафл|чай\b|кофе|напит|коктейл|готов|запечён|жарен|маринован|копчён|суп\b|пюре|в шоколаде|глазир|зефир|мусс|пастил|мармелад|халва|драже|мюсли|гранол|колбас|начинк/i;
// продукты, которые сами — переработка: к ним стоп-слова не применяются
const KEEP_STOP = /салат листовой|руккола|филе лосося|филе трески|минтай|горбуша|скумбри|консерв|соус|паста |сироп|варенье|батончик|пломбир|зефир|мармелад|слабосол|грудинк|бекон|ветчин|сосиск|пепперони|пельмен|солён|квашен|кимчи|оливк|хлеб|лаваш|сухар|гранол|творог мягкий|сыр|моцарелл|фета|рикотт|кокосов|арахисов|шоколад|какао|булочк|тортиль|багет|тесто|лапш|фунчоз|макарон|спагетти|заморож|креветк|морепродукт|мёд|финик|кураг|чернослив|изюм|крахмал|разрыхл|желатин|сахар|фисташ|миндал|кешью|арахис|орех|семен|кунжут/i;
const W = /(\d+(?:[.,]\d+)?)\s*(кг|г|мл|л)(?![а-яё])/i;
const N = /(\d+)\s*шт/i;

// «мёд» у магазина — «Мед», «свёкла» — «Свекла»: ё приравнивается к е с обеих сторон
const yo = (s: string) => s.toLowerCase().replace(/ё/g, "е");
const stem = (q: string): string => {
  const w = yo(q).replace(/[^а-я ]/g, " ").split(/\s+/).filter(x => x.length > 2)[0] ?? q;
  return w.length >= 5 ? w.slice(0, 4) : w.length === 4 ? w.slice(0, 3) : w;
};
const clean = (s: string) => s.replace(/&nbsp;/g, " ");

/** Сколько граммов в карточке: из названия, у весового — килограмм, у коробки яиц без числа — десяток. */
export function gramsInCard(name: string, unit: string, product: string): number | null {
  const n = clean(name);
  const m = W.exec(n);
  if (m) return parseFloat(m[1]!.replace(",", ".")) * (/^(кг|л)$/i.test(m[2]!) ? 1000 : 1);
  if (unit === "кг") return 1000;
  const c = N.exec(n);
  if (c) return Number(c[1]) * (product === "яйца" ? 60 : 1);
  if (product === "яйца" && !/шт/i.test(n)) return 600;
  return null;
}

/** Карточка похожа на продукт: он в первых двух словах названия, и это не переработка. */
function fits(it: VVItem, product: string): boolean {
  const low = yo(clean(it.name));
  // продукт — в первых трёх словах названия, кавычки не в счёт: «Сыр мягкий "Рикотта"» — рикотта
  if (!low.replace(/["«»]/g, "").split(/\s+/).slice(0, 3).join(" ").includes(stem(QUERY[product] ?? product))) return false;
  return KEEP_STOP.test(product) || !STOP.test(low);
}

/** Лучшая карточка под продукт: та же логика, что у снятия цен. Чистая функция — проверяется тестом. */
export function pickCard(items: VVItem[], product: string): VVMatch | null {
  let best: VVMatch | null = null;
  for (const it of items) {
    if (!fits(it, product)) continue;
    const name = clean(it.name);
    const grams = gramsInCard(name, it.unit, product);
    const price = it.price?.current;
    if (!grams || !price) continue;
    const per100 = price / grams * 100;
    if (!best || per100 < best.price / best.grams * 100) best = { xml_id: it.xml_id, name, grams, weighed: it.unit === "кг" && !W.test(name), price };
  }
  return best;
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(BACKEND_URL + "/vv", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, arguments: args }),
  });
  const j = (await res.json().catch(() => ({}))) as { data?: T; error?: string };
  if (!res.ok || j.error) throw new Error(j.error ?? "vv error");
  return j.data as T;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
// не чаще раза в секунду к магазину: пауза — только остаток до секунды, сам запрос уже занимает большую её часть
let lastCall = 0;
async function paced<T>(f: () => Promise<T>): Promise<T> {
  const wait = lastCall + PAUSE_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  return f();
}

type Cache = Record<string, VVMatch & { at: string }>;

/** Найти карточку товара: из памяти или поиском (один-два запроса). */
export async function findProduct(product: string): Promise<VVMatch | null> {
  const cache = readLS<Cache>(CACHE_KEY, {});
  const hit = cache[product];
  if (hit && Date.now() - Date.parse(hit.at) < CACHE_DAYS * 86_400_000) return hit;
  const q = QUERY[product] ?? product;
  const data = await paced(() => rpc<{ items: VVItem[]; }>("vkusvill_products_search", { q, limit: 10, page: 1, mode: "short" }));
  const items = data.items ?? [];
  let match = pickCard(items, product);
  // вес не в названии («Мёд цветочный», «Руккола») — он есть в карточке товара; смотрим две первые подходящие
  for (const it of items.filter(x => fits(x, product)).slice(0, 2)) {
    if (match) break;
    try {
      const d = await paced(() => rpc<{ weight?: { value?: number; unit?: string }; price?: { current?: number } }>("vkusvill_product_details", { id: it.xml_id }));
      const w = d.weight?.value, price = d.price?.current ?? it.price?.current;
      if (w && price) match = { xml_id: it.xml_id, name: clean(it.name), grams: w * (/^(кг|л)$/i.test(d.weight?.unit ?? "") ? 1000 : 1), weighed: false, price };
    } catch { /* карточка не открылась — продукт останется ненайденным */ }
  }
  if (match) writeLS(CACHE_KEY, { ...readLS<Cache>(CACHE_KEY, {}), [product]: { ...match, at: new Date().toISOString() } });
  return match;
}

export interface CartResult { links: { url: string; count: number }[]; found: number; missing: string[] }

/** Ссылка на корзину из уже известных товаров (готовый день): по 30 товаров на ссылку. */
export async function cartLinks(products: { xml_id: number; q: number }[]): Promise<CartResult["links"]> {
  const links: CartResult["links"] = [];
  for (let i = 0; i < products.length; i += 30) {
    const chunk = products.slice(i, i + 30);
    const data = await paced(() => rpc<{ link: string }>("vkusvill_cart_link_create", { products: chunk }));
    links.push({ url: data.link, count: chunk.length });
  }
  return links;
}

/**
 * Собрать корзину из строк списка (только то, что ещё надо купить).
 * `onProgress(i, n)` — для строки «ищу 12 из 40»: при 60 запросах в минуту список на неделю занимает около минуты.
 */
export async function buildCart(lines: BuyLine[], onProgress?: (i: number, n: number) => void): Promise<CartResult> {
  const todo = lines.filter(l => l.toBuy > 0);
  const products: { xml_id: number; q: number }[] = [];
  const missing: string[] = [];
  for (const [i, l] of todo.entries()) {
    onProgress?.(i + 1, todo.length);
    let m: VVMatch | null = null;
    try { m = await findProduct(l.name); } catch { m = null; }
    if (!m) { missing.push(l.name); continue; }
    const needG = gramsOf(l.name, l.toBuy, l.unit);
    // весовой — в килограммах с шагом 100 г; упаковки — сколько нужно, не меньше одной
    const q = m.weighed ? Math.max(0.1, Math.round(needG / 100) / 10) : Math.max(1, Math.ceil(needG / m.grams));
    products.push({ xml_id: m.xml_id, q: Math.min(40, q) });
  }
  const links: CartResult["links"] = [];
  for (let i = 0; i < products.length; i += 30) {
    const chunk = products.slice(i, i + 30);
    const data = await paced(() => rpc<{ link: string }>("vkusvill_cart_link_create", { products: chunk }));
    links.push({ url: data.link, count: chunk.length });
  }
  return { links, found: products.length, missing };
}
