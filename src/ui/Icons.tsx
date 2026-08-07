import React from "react";

/**
 * Один набор иконок на всё приложение.
 *
 * Почему свои, а не SF Symbols: шрифт символов Apple лицензирован только для приложений
 * Apple, а файлы легли бы в публичный репозиторий. Поэтому рисуем сами — но по тем же
 * правилам, по которым сделаны системные: одна толщина штриха, скруглённые концы,
 * одинаковая оптическая плотность, сетка 24 и никакой заливки.
 *
 * Толщина считается от размера: у мелкой иконки штрих должен быть тоньше, иначе она
 * выглядит жирнее текста рядом. Так же ведут себя оптические размеры в SF Symbols.
 *
 * Эмодзи в самой ленте суток (🍳 ☀️ 🛌) остаются: там они не элемент структуры,
 * а метка содержимого — именно они делают ленту понятной с одного взгляда.
 */

interface IconProps {
  /** Размер в пикселях. По умолчанию 22 — как у системных иконок в панели вкладок. */
  size?: number;
  /** Насыщенное начертание для выбранного состояния. */
  bold?: boolean;
}

const svg = ({ size = 22, bold = false }: IconProps) => ({
  width: size, height: size, viewBox: "0 0 24 24", fill: "none",
  stroke: "currentColor",
  strokeWidth: (bold ? 2.4 : 1.8) * (22 / size),   // штрих одинаково выглядит на любом размере
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

/** Сутки: циферблат со стрелками — «сегодня» это про время дня. */
export const IconToday = (p: IconProps = {}) => (
  <svg {...svg(p)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.2 2" /></svg>
);

/** Неделя: календарная сетка. */
export const IconWeek = (p: IconProps = {}) => (
  <svg {...svg(p)}>
    <rect x="3" y="5" width="18" height="16" rx="3.5" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);

/** Вопрос: реплика в чате. */
export const IconCoach = (p: IconProps = {}) => (
  <svg {...svg(p)}><path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5Z" /></svg>
);

/** Я: человек. */
export const IconProfile = (p: IconProps = {}) => (
  <svg {...svg(p)}><circle cx="12" cy="8" r="4" /><path d="M4 20.5a8 8 0 0 1 16 0" /></svg>
);

/** Назад — та же угловая скобка, что в системной навигации. */
export const IconBack = (p: IconProps = {}) => (
  <svg {...svg(p)}><path d="M15 4.5 7.5 12 15 19.5" /></svg>
);

/** Раскрыть: скобка вниз. Повёрнутая версия «назад», чтобы язык был один. */
export const IconChevron = ({ open = false, ...p }: IconProps & { open?: boolean }) => (
  <svg {...svg({ size: 18, ...p })}
    style={{ transform: open ? "rotate(-180deg)" : "none", transition: "transform 180ms ease" }}>
    <path d="M4.5 8.5 12 16l7.5-7.5" />
  </svg>
);

/** Заменить блюдо: круговая стрелка. */
export const IconSwap = (p: IconProps = {}) => (
  <svg {...svg({ size: 16, ...p })}>
    <path d="M20 11.5a8 8 0 1 0-.9 5" />
    <path d="M20 4.5v6h-6" />
  </svg>
);

/** Открыть в магазине: стрелка наружу. */
export const IconExternal = (p: IconProps = {}) => (
  <svg {...svg({ size: 14, ...p })}>
    <path d="M9 5h10v10" /><path d="M19 5 8 16" /><path d="M14 19H5V10" />
  </svg>
);

/** Проверено. */
export const IconCheck = (p: IconProps = {}) => (
  <svg {...svg(p)}><path d="M4.5 12.5 9.5 17.5 19.5 6.5" /></svg>
);
