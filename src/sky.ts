/**
 * Небо по времени суток — мягкое свечение сверху на «Сутках».
 *
 * Фон однотонный (белый или тёмно-синий), а время суток подсказывает только цвет свечения —
 * жёлтое утро (Banana Cream), голубой день (Cool Sky), синий вечер (Baltic Blue).
 * Тёмная гамма включается темой телефона, а не часами: светлая тема вечером остаётся светлой.
 */
export type SkyPhase = "morning" | "day" | "night";

/** Цвета палитры приложения. */
const GLOW: Record<SkyPhase, string> = { morning: "#FFE74C", day: "#35A7FF", night: "#38618C" };

/** Фон приложения — тот же, что --bg в sky.css. */
export const BG_LIGHT = [255, 255, 255], BG_DARK = [10, 21, 34];
export const bgHex = (dark: boolean) => (dark ? "#0A1522" : "#FFFFFF");

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
  const bg = dark ? BG_DARK : BG_LIGHT, a = alpha(dark) * 0.7;
  return "#" + rgbOf(hex).map((v, i) => Math.round(bg[i]! + (v - bg[i]!) * a).toString(16).padStart(2, "0")).join("").toUpperCase();
}
