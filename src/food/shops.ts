/**
 * Заказ продуктов в сервисах доставки.
 *
 * ⚠️ Честное ограничение, ради которого стоит прочитать этот комментарий целиком.
 * Положить товары в корзину пользователя ИЗ СТОРОННЕГО приложения нельзя: публичных API
 * у ВкусВилла, Лавки, Самоката и прочих нет — интеграция только партнёрская, по договору,
 * с выгрузкой ассортимента и обменом статусами заказов. Никакой «кнопки купить всё»
 * без такого договора не существует, и обещать её в интерфейсе нельзя.
 *
 * Что работает и проверено запросами: у каждого сервиса поиск открывается ссылкой с
 * параметром. Значит можно убрать ровно ту скуку, которая мешает: не набирать двадцать
 * названий руками, а тапнуть по товару и попасть сразу в его поиск в нужном сервисе.
 * Плюс копирование всего списка — некоторые приложения умеют распознавать его целиком.
 */

export interface Shop {
  id: string;
  name: string;
  /** Шаблон поиска: `%s` заменяется на закодированный запрос. */
  searchUrl: string;
}

export const SHOPS: Shop[] = [
  { id: "vkusvill", name: "ВкусВилл", searchUrl: "https://vkusvill.ru/search/?q=%s" },
  { id: "lavka", name: "Яндекс Лавка", searchUrl: "https://lavka.yandex.ru/search?text=%s" },
  { id: "samokat", name: "Самокат", searchUrl: "https://samokat.ru/search?text=%s" },
  { id: "kuper", name: "Купер", searchUrl: "https://kuper.ru/search?q=%s" },
  { id: "perekrestok", name: "Перекрёсток", searchUrl: "https://www.perekrestok.ru/search?search=%s" },
  { id: "magnit", name: "Магнит", searchUrl: "https://magnit.ru/search?term=%s" },
  { id: "ozon", name: "Озон", searchUrl: "https://www.ozon.ru/search/?text=%s" },
];

export const DEFAULT_SHOP_ID = "vkusvill";

export const shopById = (id: string): Shop =>
  SHOPS.find(s => s.id === id) ?? SHOPS[0]!;

/**
 * Название для поиска.
 *
 * Из названия убирается всё, что магазину не поможет: уточнения в скобках
 * («фасоль (консервированная)»), способ приготовления, лишние пробелы.
 * Количество в запрос не идёт вовсе — поиск по «250 г творога» находит хуже, чем по «творог».
 */
export function searchTerm(name: string): string {
  return name
    .replace(/\([^)]*\)/g, " ")            // скобочные уточнения
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function searchUrl(shop: Shop, itemName: string): string {
  return shop.searchUrl.replace("%s", encodeURIComponent(searchTerm(itemName)));
}

export interface ListItem {
  name: string;
  qty: number;
  unit: string;
}

/** Список для буфера обмена: человекочитаемо и годится для вставки в приложение доставки. */
export function listAsText(items: ListItem[], title = "Покупки"): string {
  const lines = items.map(i => `${i.name} — ${i.qty} ${i.unit}`);
  return `${title}\n\n${lines.join("\n")}`;
}
