import { useEffect, useState } from "react";

/**
 * Текущий момент, который не застывает.
 *
 * Найдено Сердаром: «приложение будто на 3 часа назад живёт, хотя при этом видит, что мне
 * надо делать дальше по расписанию». Причина ровно такая: `new Date()` вычислялся один раз
 * при первом рендере экрана и больше не пересчитывался. План по расписанию строится
 * от профиля (подъём, отбой), поэтому он оставался верным, а «сейчас / дальше» и пометки
 * «этот шаг уже прошёл» отставали на столько, сколько приложение провисело открытым.
 *
 * У установленной PWA это особенно заметно: она не перезагружается, а восстанавливается
 * из фона — свернул утром, открыл вечером, и приложение всё ещё живёт в утре.
 *
 * Поэтому два источника обновления: минутный тик, пока приложение на экране, и явное
 * обновление при возврате к нему. Одного тика мало — в фоне таймеры замораживаются;
 * одного `visibilitychange` мало — приложение может лежать открытым часами.
 */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    // минута — шаг ленты суток, дробить мельче незачем
    const id = window.setInterval(tick, 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") tick(); };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", tick);
    window.addEventListener("pageshow", tick);   // возврат из кэша Safari

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", tick);
      window.removeEventListener("pageshow", tick);
    };
  }, []);

  return now;
}
