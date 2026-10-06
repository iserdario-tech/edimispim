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

/** Крупный пузырь для пустого чата — тот же силуэт, что у вкладки, но самостоятельный знак. */
export const IconCoachBubble = () => (
  <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor"
    strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5Z" />
    <circle cx="9" cy="12" r=".9" fill="currentColor" stroke="none" />
    <circle cx="13" cy="12" r=".9" fill="currentColor" stroke="none" />
    <circle cx="17" cy="12" r=".9" fill="currentColor" stroke="none" />
  </svg>
);

/** Раскрыть: скобка вниз. Повёрнутая версия «назад», чтобы язык был один. */
export const IconChevron = ({ open = false, ...p }: IconProps & { open?: boolean }) => (
  <svg {...svg({ size: 18, ...p })}
    style={{ transform: open ? "rotate(-180deg)" : "none", transition: "transform 180ms ease" }}>
    <path d="M4.5 8.5 12 16l7.5-7.5" />
  </svg>
);

/** Отправить вопрос: стрелка вверх, как в системных полях ввода. */
export const IconSend = (p: IconProps = {}) => (
  <svg {...svg({ size: 20, ...p })}><path d="M12 19V5M6 11l6-6 6 6" /></svg>
);

/** Нравится / не нравится: одна фигура, перевёрнутая по вертикали, — язык иконок один. */
export const IconThumb = ({ down = false, ...p }: IconProps & { down?: boolean }) => (
  <svg {...svg({ size: 16, ...p })} style={{ transform: down ? "rotate(180deg)" : "none" }}>
    <path d="M7 21V10l4.5-7a2.2 2.2 0 0 1 2 3l-1 4h5.2a2 2 0 0 1 2 2.4l-1.4 6.8A2.5 2.5 0 0 1 15.8 21Z" />
    <path d="M7 10H3.8v11H7" />
  </svg>
);
