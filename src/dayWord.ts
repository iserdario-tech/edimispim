import type { DayMode } from "./types.js";

/**
 * Слово дня — главный заголовок «Суток» в 2.0.
 *
 * Лучшие приложения отвечают на «как я сегодня» одним словом или числом, а не четырьмя
 * карточками (research-2.0/competitors.md). Баллов здесь нет сознательно: тревога из-за
 * оценок сна — отдельная проблема трекеров (ортосомния). Слово описывает ПЛАН дня,
 * а не оценивает человека. Порядок правил важен: свободный день сильнее всего,
 * вечер сильнее «лёгкого дня» — вечером важнее, когда ложиться, чем какая была ночь.
 */
export interface DayWordInput {
  nowMin: number;          // минуты от полуночи сейчас
  logged: boolean;         // ночь сегодня отмечена
  rough: boolean;          // плохая ночь (isRoughNight)
  mode: DayMode;
  cheat: boolean;          // свободный день (читмил)
  dinnerMin?: number;      // время ужина по плану
  dinnerMarked: boolean;   // ужин отмечен
  bedMin: number;          // отбой по плану; после полуночи — больше 1440
  sleptMin?: number;       // длительность прошлой ночи, если отбой известен
  wokeHM: string;
}

export interface DayWord { word: string; sub: string; phase: "morning" | "day" | "evening" }

const MORNING_UNTIL = 11 * 60;
const EVENING_BEFORE_BED = 3 * 60;
/** До 05:00 — это ещё вчерашний вечер, а не утро нового дня. */
const NIGHT_UNTIL = 5 * 60;

const hm = (min: number): string => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const dur = (min: number): string => {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? `${h} ч${m ? ` ${String(m).padStart(2, "0")}` : ""}` : `${m} мин`;
};

export function dayWord(i: DayWordInput): DayWord {
  if (i.cheat) return { word: "Ем без плана", sub: "меню и счёт калорий сегодня выключены", phase: "day" };

  const now = i.nowMin < NIGHT_UNTIL ? i.nowMin + 1440 : i.nowMin;
  const dinnerPassed = i.dinnerMarked || (i.dinnerMin !== undefined && now >= i.dinnerMin);
  const toBed = i.bedMin - now;
  if (dinnerPassed && toBed < EVENING_BEFORE_BED) {
    return { word: "Пора закругляться", sub: `спать в ${hm(i.bedMin)} · ${toBed > 0 ? `через ${dur(toBed)}` : "уже пора"}`, phase: "evening" };
  }

  if (!i.logged && now < MORNING_UNTIL) return { word: "Доброе утро", sub: `встал в ${i.wokeHM}`, phase: "morning" };

  const phase = now < MORNING_UNTIL ? "morning" : "day";
  if (i.rough) {
    const night = i.sleptMin !== undefined ? `ночь ${dur(i.sleptMin)}` : "ночь была плохой";
    return { word: "Лёгкий день", sub: `${night} · план проще, калории те же`, phase };
  }
  if (i.mode === "crunch") return { word: "Долгий день", sub: "держим силы до поздней ночи", phase };
  if (i.mode === "recovery") return { word: "День отдыха", sub: "отсыпаемся, без давления", phase };
  return { word: "Обычный день", sub: "", phase };
}
