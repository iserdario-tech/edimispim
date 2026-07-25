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
        name: "едим и спим — сутки целиком",
        short_name: "едим и спим",
        lang: "ru",
        start_url: ".",
        scope: ".",
        display: "standalone",
        background_color: "#0e1116",
        theme_color: "#0e1116",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ],
});
