import { useEffect } from "react";

/**
 * Свайп от левого края — «назад», как в системе.
 *
 * HIG отдельно отмечает: телефон держат одной рукой, и до верхнего угла с кнопкой
 * «назад» дотянуться тяжело, поэтому жест должен работать. У нас своя навигация
 * поверх одной страницы, системный жест её не закрывает — вешаем руками.
 *
 * Осторожности, без которых жест мешает жить:
 * - начинается ТОЛЬКО у левого края (28 px): иначе он перехватывал бы горизонтальную
 *   прокрутку списков и перетаскивание ползунка «как спалось»;
 * - срабатывает, если движение по горизонтали заметно больше вертикального —
 *   иначе обычная прокрутка страницы закрывала бы экран;
 * - слушатели пассивные: прокрутку не блокируем.
 */
const EDGE_PX = 28;        // насколько близко к краю должен начаться жест
const MIN_DX = 70;         // сколько протянуть, чтобы это считалось намерением
const MAX_ANGLE = 0.6;     // |dy| / |dx| — выше значит человек листает, а не тянет назад

export function useSwipeBack(enabled: boolean, onBack: () => void): void {
  useEffect(() => {
    if (!enabled) return;
    let x0 = 0, y0 = 0, tracking = false;

    const start = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      tracking = t.clientX <= EDGE_PX;
      x0 = t.clientX; y0 = t.clientY;
    };
    const end = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - x0, dy = Math.abs(t.clientY - y0);
      if (dx >= MIN_DX && dy / Math.max(dx, 1) <= MAX_ANGLE) onBack();
    };

    document.addEventListener("touchstart", start, { passive: true });
    document.addEventListener("touchend", end, { passive: true });
    return () => {
      document.removeEventListener("touchstart", start);
      document.removeEventListener("touchend", end);
    };
  }, [enabled, onBack]);
}
