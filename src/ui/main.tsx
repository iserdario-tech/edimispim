import React from "react";
import { createRoot } from "react-dom/client";
import { readTheme, applyTheme } from "./theme.js";
import { App } from "./App.js";
import "./ui.css";

// тема ставится до первой отрисовки, иначе экран мигнёт чужим фоном
applyTheme(readTheme());

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
 * прямо сейчас; если человек в нём — ждём, пока он свернёт, и обновляемся тогда.
 * В обоих случаях он просто открывает приложение и видит новую версию, не зная,
 * что что-то происходило. Удалять значок и ставить заново не нужно никогда.
 */
if ("serviceWorker" in navigator) {
  let reloading = false;
  const reloadWhenHidden = () => {
    if (reloading) return;
    reloading = true;
    if (document.visibilityState === "hidden") location.reload();
    else document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") location.reload();
    }, { once: true });
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

createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>
);
