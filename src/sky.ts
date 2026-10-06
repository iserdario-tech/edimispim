/**
 * Небо по времени суток — мягкое свечение сверху на «Сутках».
 *
 * Схема «Чёрный и система»: фон однотонный (чёрный или системный серый), а время суток
 * подсказывает только цвет свечения — оранжевое утро, голубой день, индиговый вечер.
 * Тёмная гамма включается темой телефона, а не часами: светлая тема вечером остаётся светлой.
 */
export type SkyPhase = "morning" | "day" | "night";

/** Системные цвета Apple (тёмный вариант — он же читается и на светлом фоне). */
const GLOW: Record<SkyPhase, string> = { morning: "#FF9F0A", day: "#64D2FF", night: "#5E5CE6" };

const MORNING_FROM = 5 * 60, DAY_FROM = 11 * 60, EVENING_FROM = 18 * 60;

export function skyFor(minuteOfDay: number, dark: boolean): { phase: SkyPhase; night: boolean; glow: string } {
  const m = ((minuteOfDay % 1440) + 1440) % 1440;
  const phase: SkyPhase = m >= MORNING_FROM && m < DAY_FROM ? "morning"
    : m >= DAY_FROM && m < EVENING_FROM ? "day"
    : "night";
  return { phase, night: dark, glow: GLOW[phase] };
}

const alpha = (dark: boolean) => (dark ? 0.4 : 0.25);
const rgbOf = (hex: string) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };

/** CSS-свечение: цвет сверху по центру, к середине экрана растворяется в фоне.
 *  Координаты — от верха подложки .s-sky, которая начинается на 120px выше экрана. */
export function skyGlow(hex: string, dark: boolean): string {
  const rgb = rgbOf(hex).join(", ");
  return `radial-gradient(140% 380px at 50% 50px, rgba(${rgb}, ${alpha(dark)}) 0%, rgba(${rgb}, 0) 72%)`;
}

/**
 * Цвет верхнего края экрана со свечением — для theme-color. iOS красит полосу под часами
 * этим цветом; если он не совпадает с тем, что под ним, сверху видна тёмная полоса.
 * 0.7 — доля свечения у верхнего края (центр эллипса на 70px выше экрана, радиус 380px).
 */
export function skyTopColor(hex: string, dark: boolean): string {
  const bg = dark ? [0, 0, 0] : [242, 242, 247], a = alpha(dark) * 0.7;
  return "#" + rgbOf(hex).map((v, i) => Math.round(bg[i]! + (v - bg[i]!) * a).toString(16).padStart(2, "0")).join("").toUpperCase();
}
