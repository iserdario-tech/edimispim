import type { DayMode } from "./types.js";

/**
 * Слово дня — главный заголовок «Суток» в 2.0.
 *
 * Лучшие приложения отвечают на «как я сегодня» одним словом или числом, а не четырьмя
 * карточками (research-2.0/competitors.md). Баллов здесь нет сознательно: тревога из-за
 * оценок сна — отдельная проблема трекеров (ортосомния). Слово описывает, ЧТО ДАЛЬШЕ
 * в плане, а не оценивает человека.
 *
 * Переписано 2026-10-08 по замечанию с телефона: вечером при неотмеченном ужине, душе и отбое
 * впереди заголовок уже говорил «Пора закругляться» — потому что смотрел на часы, а не на то,
 * что осталось. Теперь слово считается от оставшихся приёмов: «Остался ужин», «Ещё 2 приёма»,
 * «Ужин ждёт», «Еда на сегодня всё», и только с пустым списком дел — «Пора закругляться».
 */
export interface DayWordMeal { slot: string; timeMin: number; marked: boolean }

export interface DayWordInput {
  nowMin: number;          // минуты от полуночи сейчас
  logged: boolean;         // ночь сегодня отмечена
  rough: boolean;          // плохая ночь (isRoughNight)
  mode: DayMode;
  cheat: boolean;          // свободный день (читмил)
  /** Приёмы дня со временем и отметкой «съел» / «своё». Пусто — еда не настроена. */
  meals: DayWordMeal[];
  bedMin: number;          // отбой по плану; после полуночи — больше 1440
  sleptMin?: number;       // длительность прошлой ночи, если отбой известен
  wokeHM: string;
}

export interface DayWord { word: string; sub: string; phase: "morning" | "day" | "evening" }

const MORNING_UNTIL = 11 * 60;
const EVENING_BEFORE_BED = 3 * 60;
/** За час до отбоя — время закругляться: свет вниз, экраны прочь. */
const WIND_DOWN = 60;
/** До 05:00 — это ещё вчерашний вечер, а не утро нового дня. */
const NIGHT_UNTIL = 5 * 60;
/** Приём, время которого прошло на столько, а отметки нет, — «ждёт»; старше — считаем пропущенным. */
const WAITING_FROM = 15, WAITING_UNTIL = 90;

const SLOT_RU: Record<string, { nom: string; left: string }> = {
  breakfast: { nom: "завтрак", left: "Остался завтрак" },
  lunch: { nom: "обед", left: "Остался обед" },
  dinner: { nom: "ужин", left: "Остался ужин" },
  snack: { nom: "перекус", left: "Остался перекус" },
  dessert: { nom: "сладкое", left: "Осталось сладкое" },
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const hm = (min: number): string => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const dur = (min: number): string => {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  // неразрывные пробелы: число не отрывается от «ч» и «мин» при переносе строки
  return h ? `${h} ч${m ? ` ${String(m).padStart(2, "0")}` : ""}` : `${m} мин`;
};
const meals = (n: number): string => `${n} ${n === 1 ? "приём" : n < 5 ? "приёма" : "приёмов"}`;

export function dayWord(i: DayWordInput): DayWord {
  if (i.cheat) return { word: "Ем без плана", sub: "меню и счёт калорий сегодня выключены", phase: "day" };

  const now = i.nowMin < NIGHT_UNTIL ? i.nowMin + 1440 : i.nowMin;
  const toBed = i.bedMin - now;
  const bedSub = `спать в ${hm(i.bedMin)} · ${toBed > 0 ? `через ${dur(toBed)}` : "уже пора"}`;

  // что осталось: неотмеченные приёмы, кроме пропущенных давно — их уже не «ждут»
  const left = i.meals.filter(m => !m.marked && now - m.timeMin <= WAITING_UNTIL).sort((a, b) => a.timeMin - b.timeMin);
  const next = left[0];
  const nextRU = next ? SLOT_RU[next.slot] ?? { nom: next.slot, left: `Остался ${next.slot}` } : undefined;

  if (toBed <= 0) return { word: "Пора спать", sub: bedSub, phase: "evening" };

  if (!i.logged && now < MORNING_UNTIL) return { word: "Доброе утро", sub: `встал в ${i.wokeHM}`, phase: "morning" };

  const phase = now < MORNING_UNTIL ? "morning" : toBed < EVENING_BEFORE_BED ? "evening" : "day";

  // еды больше нет — вечер считается от отбоя
  if (!next) {
    if (toBed <= WIND_DOWN) return { word: "Пора закругляться", sub: bedSub, phase: "evening" };
    if (toBed < EVENING_BEFORE_BED) return { word: "Вечер свободен", sub: bedSub, phase: "evening" };
    if (i.meals.length) return { word: "Еда на сегодня всё", sub: bedSub, phase };
  }

  // приём, чьё время прошло, а отметки нет: сначала он, что бы ни было дальше
  if (next && nextRU && now - next.timeMin >= WAITING_FROM) {
    return { word: `${cap(nextRU.nom)} ждёт`, sub: `был в ${hm(next.timeMin)} · отметь или замени`, phase };
  }

  const nextSub = next && nextRU ? `${nextRU.nom} в ${hm(next.timeMin)}` : "";

  if (i.rough) {
    const night = i.sleptMin !== undefined ? `ночь ${dur(i.sleptMin)}` : "ночь была плохой";
    return { word: "Лёгкий день", sub: `${night} · план проще${nextSub ? ` · ${nextSub}` : ", калории те же"}`, phase };
  }
  if (i.mode === "crunch") return { word: "Долгий день", sub: `держим силы до поздней ночи${nextSub ? ` · ${nextSub}` : ""}`, phase };
  if (i.mode === "recovery") return { word: "День отдыха", sub: `отсыпаемся, без давления${nextSub ? ` · ${nextSub}` : ""}`, phase };

  if (!next || !nextRU) return { word: "Обычный день", sub: "", phase };

  // вечер: сколько ещё еды до отбоя
  if (toBed < EVENING_BEFORE_BED) {
    return left.length === 1
      ? { word: nextRU.left, sub: `в ${hm(next.timeMin)} · ${bedSub}`, phase: "evening" }
      : { word: `Ещё ${meals(left.length)}`, sub: `${nextSub} · ${bedSub}`, phase: "evening" };
  }
  return { word: `Дальше ${nextRU.nom}`, sub: `в ${hm(next.timeMin)} · осталось ${meals(left.length)}`, phase };
}
