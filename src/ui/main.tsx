import React from "react";
import { createRoot } from "react-dom/client";
import { readTheme, applyTheme } from "./theme.js";
import { App } from "./App.js";
import "./ui.css";

// тема ставится до первой отрисовки, иначе экран мигнёт чужим фоном
applyTheme(readTheme());

/**
 * Проверять обновление при каждом возврате к приложению.
 *
 * Найдено на симуляторе: приложение, установленное на «Домой», продолжало показывать
 * старую версию и после нескольких запусков — то есть выкаченные исправления до человека
 * просто не доезжали. Причина в том, что установленная PWA не перезагружает страницу:
 * она восстанавливается из фона, а браузер перепроверяет service worker редко и по своему
 * усмотрению (плюс GitHub Pages отдаёт `sw.js` с десятиминутным кэшем).
 *
 * Поэтому просим проверку явно — при возврате на экран. Дальше работает `registerType:
 * "autoUpdate"`: новый worker активируется сам и страница обновляется.
 */
if ("serviceWorker" in navigator) {
  void navigator.serviceWorker.ready.then((reg) => {
    const check = () => { if (document.visibilityState === "visible") void reg.update(); };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", check);
  }).catch(() => { /* без service worker приложение работает, просто без офлайна */ });
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>
);
