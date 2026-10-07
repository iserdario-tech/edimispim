import type { FoodSettings } from "./storage.js";
import { cookDaysOf } from "./dayOpts.js";

/**
 * Показанное меню запоминается и само больше не меняется.
 *
 * Меню считается из даты и правил подбора, и любая правка правил при обновлении приложения
 * перетасовывала текущую неделю: продукты куплены под одно меню, а на экране уже другое.
 * Теперь блюда, которые человек увидел, держатся до своей даты. Сбрасываются они, только
 * когда человек сам меняет то, из чего меню собирается (ограничения, число приёмов, время
 * на готовку, остатки). Калории меню не сбрасывают — меняются порции, а не блюда.
 *
 * Не действует в день «сегодня не готовлю» и после плохой ночи: там меню перестраивается
 * нарочно. Ручные замены и замены партнёра — поверх запомненного.
 */
export interface MenuMemory {
  key: string;
  days: Record<string, Record<string, string>>;
}

export const menuKey = (f: FoodSettings): string =>
  JSON.stringify([f.constraints, f.mealCount, f.cookMin ?? null, cookDaysOf(f)]);

/** Запомненные блюда даты — если они ещё в силе. */
export function rememberedFor(
  menu: MenuMemory | undefined, food: FoodSettings, iso: string, noCookDays?: string[],
): Record<string, string> | undefined {
  if (!menu || menu.key !== menuKey(food) || noCookDays?.includes(iso)) return undefined;
  return menu.days[iso];
}

/** Добавить новые дни; другой ключ — запомненное устарело целиком. Старше двух недель — не нужно. */
export function remember(menu: MenuMemory | undefined, key: string, days: MenuMemory["days"], todayISO: string): MenuMemory {
  const from = new Date(Date.parse(todayISO + "T12:00:00Z") - 14 * 86_400_000).toISOString().slice(0, 10);
  const all = { ...(menu?.key === key ? menu.days : {}), ...days };
  return { key, days: Object.fromEntries(Object.entries(all).filter(([d]) => d >= from)) };
}
