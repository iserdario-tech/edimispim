/**
 * «Мои товары» — память о том, что именно ты покупаешь.
 *
 * Проблема, которую это решает: ссылка в поиск экономит набор текста, но по запросу
 * «помидоры» вываливается два десятка позиций с разной ценой, и выбирать приходится
 * каждую неделю заново. Достаточно запомнить выбор один раз: дальше приложение ведёт
 * прямо на нужный товар, а не в поиск.
 *
 * Хранится по паре «продукт + сервис»: во ВкусВилле и в Лавке это разные карточки.
 */

export interface Favorite {
  url: string;      // ссылка на карточку товара
  label?: string;   // как назвал сам человек: «черри 250 г», «тот, что подешевле»
}

export type Favorites = Record<string, Favorite>;   // «продукт|сервис» → товар

const KEY = "edimispim.favorites";

export const favKey = (itemName: string, shopId: string): string =>
  `${itemName.toLowerCase().trim()}|${shopId}`;

export function loadFavorites(): Favorites {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    // то же правило, что и с основным состоянием: мусор не должен ронять экран
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Favorites) : {};
  } catch { return {}; }
}

export function saveFavorite(favs: Favorites, itemName: string, shopId: string, fav: Favorite): Favorites {
  const next = { ...favs, [favKey(itemName, shopId)]: fav };
  persist(next);
  return next;
}

export function removeFavorite(favs: Favorites, itemName: string, shopId: string): Favorites {
  const next = { ...favs };
  delete next[favKey(itemName, shopId)];
  persist(next);
  return next;
}

function persist(favs: Favorites): void {
  try { localStorage.setItem(KEY, JSON.stringify(favs)); } catch { /* приватный режим */ }
}

/**
 * Ссылка на товар из буфера обмена.
 *
 * Из магазина копируется что угодно: ссылка с трекингом, текст «Смотри что нашёл: https://…»,
 * короткая ссылка из шторки «Поделиться». Вытаскиваем первый http-адрес и отрезаем
 * рекламные хвосты, чтобы не таскать чужую аналитику.
 */
export function extractProductUrl(pasted: string): string | null {
  const match = /https?:\/\/[^\s"'<>]+/.exec(pasted ?? "");
  if (!match) return null;
  try {
    const url = new URL(match[0]);
    for (const p of [...url.searchParams.keys()]) {
      if (/^(utm_|from$|sid$|erid$|_openstat|yclid|gclid|fbclid)/i.test(p)) url.searchParams.delete(p);
    }
    return url.toString();
  } catch { return null; }
}
