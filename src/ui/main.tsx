import React from "react";
import { createRoot } from "react-dom/client";
import { readTheme, applyTheme } from "./theme.js";
import { Shell, UpdateBanner, UPDATE_EVENT } from "../ui2/Shell.js";
import { Crash } from "../ui2/Crash.js";
import "../ui2/sky.css";
import { askPersistentStorage } from "./dataSafety.js";
import "./ui.css";

// тема ставится до первой отрисовки, иначе экран мигнёт чужим фоном
applyTheme(readTheme());
// классы оболочки 2.0 — тоже до первого кадра: Shell ставит их в эффекте, то есть после
// отрисовки, и первый кадр был серым (светлая) или чёрным (тёмная) по старым токенам
{
  const t = readTheme();
  document.documentElement.classList.add("v2");
  document.documentElement.classList.toggle("night", t === "dark" || (t === "auto" && matchMedia("(prefers-color-scheme: dark)").matches));
}

/**
 * Приложение не масштабируется щипком.
 *
 * `user-scalable=no` в мета-теге Safari намеренно игнорирует — Apple не даёт сайтам
 * запрещать зум. Но приложение на экране «Домой» ведёт себя не как сайт: отзумленная
 * страница шире экрана, и всё «съезжает» — закреплённые панели считают ширину от макета,
 * а не от видимой области, и кнопка отправки уезжает за правый край. Поэтому жест
 * перехватываем сами: это единственный способ, который в Safari работает.
 *
 * Что при этом НЕ ломается: системный размер текста. Он живёт в настройках телефона,
 * приложение его слушает (`font: -apple-system-body`), и человеку со слабым зрением
 * крупный шрифт доступен без всякого зума — так же, как в родных приложениях Apple.
 */
for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}
/* Двойной тап тоже масштабирует; `touch-action` убирает это, не трогая обычные нажатия. */
document.documentElement.style.touchAction = "manipulation";

/**
 * Обновления приезжают сами — без переустановки приложения.
 *
 * Найдено на симуляторе: PWA, добавленная на «Домой», показывала старую версию даже
 * после нескольких запусков, то есть выкаченные исправления до человека не доходили.
 * Причин две, и лечить надо обе.
 *
 * 1. Установленная PWA не перезагружается — она восстанавливается из фона, а браузер
 *    перепроверяет service worker редко и по своему усмотрению (плюс GitHub Pages отдаёт
 *    `sw.js` с десятиминутным кэшем). Поэтому просим проверку явно: при каждом возврате
 *    к приложению и раз в час, если оно висит открытым сутками.
 *
 * 2. Даже когда новый worker установился и активировался, открытая страница продолжает
 *    работать на СТАРОМ коде до перезагрузки. Значит перезагрузку надо сделать самим —
 *    но не выдёргивая экран из-под рук.
 *
 * Отсюда правило перезагрузки: если приложение сейчас не на экране — обновляемся молча
 * прямо сейчас; если человек в нём — показываем плашку «Обновить» и, если он её не нажал,
 * обновляемся, когда свернёт.
 * В обоих случаях он просто открывает приложение и видит новую версию, не зная,
 * что что-то происходило. Удалять значок и ставить заново не нужно никогда.
 */
if ("serviceWorker" in navigator) {
  // при самом первом заходе worker тоже «берёт управление» — это не обновление
  const hadWorker = !!navigator.serviceWorker.controller;
  let reloading = false;
  // Открыта шторка или настройки — там может быть недописанный вес, «что съел», вопрос
  // коучу или изменённая форма. Тихо перезагрузив, мы бы это стёрли; ждём, пока закроет.
  // Сохранённое не в опасности в любом случае: каждое действие пишется на диск сразу.
  const busy = () => !!document.querySelector(".sheet, .s-settings");
  const reloadWhenHidden = () => {
    if (reloading || !hadWorker) return;
    reloading = true;
    if (document.visibilityState === "hidden" && !busy()) { location.reload(); return; }
    // человек в приложении: показываем плашку «Обновить», а если не нажмёт — обновимся, когда свернёт
    if (document.visibilityState === "visible") window.dispatchEvent(new Event(UPDATE_EVENT));
    const onHide = () => {
      if (document.visibilityState !== "hidden" || busy()) return;
      document.removeEventListener("visibilitychange", onHide);
      location.reload();
    };
    document.addEventListener("visibilitychange", onHide);
  };
  // сработает, когда новый worker возьмёт управление (у нас `skipWaiting` + `clientsClaim`)
  navigator.serviceWorker.addEventListener("controllerchange", reloadWhenHidden);

  void navigator.serviceWorker.ready.then((reg) => {
    const check = () => { if (document.visibilityState === "visible") void reg.update(); };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", check);
    window.setInterval(check, 60 * 60 * 1000);   // приложение может не закрываться сутками
    check();
  }).catch(() => { /* без service worker приложение работает, просто без офлайна */ });
}

// просим браузер не стирать данные; в Safari ненадёжно, но безвредно
askPersistentStorage();

// флаг сборки 2.0 больше не нужен: старого интерфейса нет
try { localStorage.removeItem("edimispim.v2"); } catch { /* приватный режим */ }

createRoot(document.getElementById("root")!).render(
  <React.StrictMode><Crash><Shell /></Crash><UpdateBanner /></React.StrictMode>
);
