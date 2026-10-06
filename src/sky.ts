/**
 * Небо по времени суток — фон «Суток» в 2.0.
 *
 * Цвет объясняет время без слов: персиковое утро, голубой день, индиговый вечер.
 * Палитра — из `research-2.0/design.md`, контраст текста проверен на каждом фоне.
 * Тёмная тема — всегда ночное небо: светлый градиент в тёмной теме слепил бы.
 */
export type SkyPhase = "morning" | "day" | "night";

const STOPS: Record<SkyPhase, string[]> = {
  morning: ["#FFC9A0", "#FFEBD8", "#EAF4FF"],
  day: ["#BFDFFF", "#EEF6FF", "#FFF4EA"],
  night: ["#3B2E6E", "#1E2348", "#0D1024"],
};

const MORNING_FROM = 5 * 60, DAY_FROM = 11 * 60, EVENING_FROM = 18 * 60;

export function skyFor(minuteOfDay: number, dark: boolean): { phase: SkyPhase; night: boolean; stops: string[] } {
  const m = ((minuteOfDay % 1440) + 1440) % 1440;
  const phase: SkyPhase = dark ? "night"
    : m >= MORNING_FROM && m < DAY_FROM ? "morning"
    : m >= DAY_FROM && m < EVENING_FROM ? "day"
    : "night";
  return { phase, night: phase === "night", stops: STOPS[phase] };
}

/** CSS-градиент для фона экрана. */
export const skyGradient = (stops: string[]): string =>
  `linear-gradient(180deg, ${stops[0]} 0%, ${stops[1]} 45%, ${stops[2]} 100%)`;
