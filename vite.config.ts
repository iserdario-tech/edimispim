import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages отдаёт проект по пути /<имя-репо>/ — репозиторий должен называться "edimispim".
// ⚠️ origin обязан совпасть со старыми приложениями (iserdario-tech.github.io), иначе
// автоматическая миграция данных из pospat/oheedet через localStorage не сработает.
export default defineConfig({
  base: "/edimispim/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        importScripts: ["push-sw.js"],
        skipWaiting: true,        // новая версия активируется сразу
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: "edim & spim — сутки целиком",
        short_name: "edim & spim",
        lang: "ru",
        start_url: ".",
        scope: ".",
        display: "standalone",
        background_color: "#000000",
        theme_color: "#000000",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          // maskable — с полями: Android обрезает иконку под свою форму,
          // и без запаса от логотипа отъело бы светящееся кольцо
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
});
