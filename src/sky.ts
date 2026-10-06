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

/** CSS-свечение: цвет сверху по центру, к середине экрана растворяется в фоне. */
export function skyGlow(hex: string, dark: boolean): string {
  const n = parseInt(hex.slice(1), 16);
  const rgb = `${n >> 16}, ${(n >> 8) & 255}, ${n & 255}`;
  return `radial-gradient(140% 42% at 50% -8%, rgba(${rgb}, ${dark ? 0.4 : 0.25}) 0%, rgba(${rgb}, 0) 72%)`;
}
