/**
 * Мелкие ключи localStorage — те, что живут отдельно от основного состояния:
 * кладовка, выбранный магазин, «мои товары».
 *
 * Вынесено из экрана покупок, когда кладовкой понадобилось пользоваться и в меню недели:
 * замена блюда теперь предлагает то, что уже лежит дома. Одно чтение и одна запись
 * на всё приложение — иначе два экрана разошлись бы в том, что считают домашними запасами.
 *
 * Запись молча падает в приватном режиме Safari: потерять выбор магазина не страшно,
 * а ронять приложение из-за этого — страшно.
 */
export const readLS = <T,>(key: string, fallback: T): T => {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; }
  catch { return fallback; }
};

export const writeLS = (key: string, v: unknown): void => {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* приватный режим */ }
};

export const PANTRY_KEY = "edimispim.pantry";
export const SHOP_KEY = "edimispim.shop";
