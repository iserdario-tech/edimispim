/**
 * Защита данных от браузера.
 *
 * Все данные человека живут только на устройстве, а Safari стирает хранилище сайта,
 * если им не пользовались семь дней (ITP, webkit.org/blog/10218). Приложение,
 * установленное на экран «Домой», под это правило не попадает — у него свой счётчик.
 * Отсюда две защиты: звать установить приложение и напоминать сохранить копию.
 */

/** Когда человек последний раз сохранял копию — ISO-дата. Только на этом устройстве. */
export const BACKUP_KEY = "edimispim.backupAt";
/** Плашку установки закрыли — больше не показываем. */
export const INSTALL_HINT_KEY = "edimispim.installHintClosed";

/**
 * Запущено ли приложение с домашнего экрана, а не из браузера.
 *
 * У установленной на «Домой» PWA на iOS **своё хранилище**, отдельное от Safari
 * (проверено в симуляторе iOS 27): данные из Safari туда сами не переезжают.
 */
export const isStandalone = (): boolean => {
  try {
    return window.matchMedia?.("(display-mode: standalone)").matches
      || (window.navigator as { standalone?: boolean }).standalone === true;
  } catch { return false; }
};

/** iPhone или iPad — только там Safari стирает данные через неделю простоя.
 *  iPad с iPadOS 13+ представляется Маком, его выдаёт сенсорный экран. */
export const isIOS = (): boolean => {
  try {
    return /iP(hone|ad|od)/.test(navigator.userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  } catch { return false; }
};

const MS_DAY = 86_400_000;
export const daysSince = (fromISO: string, toISO: string): number =>
  Math.round((Date.parse(toISO + "T00:00:00Z") - Date.parse(fromISO + "T00:00:00Z")) / MS_DAY);

/** Порог «пора сохранить»: неделя — ровно срок, после которого Safari может всё стереть. */
const BACKUP_EVERY_DAYS = 7;
/** Пока данных меньше чем на три дня, терять почти нечего — не надоедаем с первого запуска. */
const MIN_DAYS_OF_DATA = 3;

export function backupDue(lastISO: string | null, todayISO: string, daysWithData: number): boolean {
  if (daysWithData < MIN_DAYS_OF_DATA) return false;
  const last = lastISO && /^\d{4}-\d{2}-\d{2}$/.test(lastISO) ? lastISO : null;
  return last === null || daysSince(last, todayISO) >= BACKUP_EVERY_DAYS;
}

/** Попросить браузер не стирать данные. В Safari это работает ненадёжно — поэтому
 *  главная защита всё-таки установка на экран и копия; вызов безвреден, если не сработал. */
export function askPersistentStorage(): void {
  try { void navigator.storage?.persist?.().catch(() => {}); } catch { /* нет API — и ладно */ }
}
