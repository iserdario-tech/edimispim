import React from "react";

/**
 * Иконки навигации — SVG, а не эмодзи: эмодзи зависят от шрифта системы, по-разному
 * выглядят на iOS и Android и не красятся темой.
 *
 * Эмодзи в самой ленте суток (🍳 ☀️ 🛌) остаются: там они не элемент структуры,
 * а метка содержимого — именно они делают ленту понятной с одного взгляда.
 */
const base = {
  width: 22, height: 22, viewBox: "0 0 24 24", fill: "none",
  stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const IconToday = () => (
  <svg {...base}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);

export const IconWeek = () => (
  <svg {...base}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
);

export const IconCoach = () => (
  <svg {...base}><path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5Z" /></svg>
);

export const IconProfile = () => (
  <svg {...base}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
);
