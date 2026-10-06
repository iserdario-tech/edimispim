import type { DayRecord } from "./day-log.js";
import { sleepDurationMin } from "./readiness.js";
import { isRoughNight } from "./food/adapt.js";

/**
 * История недели — итоги «сторис»-слайдами вместо вкладки из семи карточек.
 *
 * Так делают Oura и WHOOP: раз в неделю короткий рассказ, который хочется пролистать,
 * вместо экрана цифр, на который заходят раз в месяц. Пять слайдов: сон, еда, вес,
 * «заметили», что дальше. Меньше четырёх дней данных — истории нет: «2 ночи» не неделя.
 */
export interface Slide {
  kind: "sleep" | "food" | "weight" | "noticed" | "next";
  title: string;
  big: string;
  sub: string;
  bars?: number[];      // 0..1 по дням недели — для столбиков
}

const DOW = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const MS_DAY = 86_400_000;
const shift = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") + n * MS_DAY).toISOString().slice(0, 10);
const dur = (min: number) => `${Math.floor(min / 60)} ч ${String(Math.round(min % 60)).padStart(2, "0")}`;

export function weekStory(records: DayRecord[], mondayISO: string, targetSleepMin: number): Slide[] | null {
  const dates = Array.from({ length: 7 }, (_, i) => shift(mondayISO, i));
  const byDate = new Map(records.map(r => [r.date, r]));
  const days = dates.map(d => byDate.get(d));
  const withData = days.filter(r => r && (r.sleep || r.food || r.body)).length;
  if (withData < 4) return null;

  const mins = days.map(r => (r?.sleep?.bedHM ? sleepDurationMin(r.sleep, targetSleepMin) : null));
  const known = mins.filter((m): m is number => m !== null);
  const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
  const prev = records.filter(r => r.date >= shift(mondayISO, -7) && r.date < mondayISO && r.sleep?.bedHM)
    .map(r => sleepDurationMin(r.sleep!, targetSleepMin));
  const prevAvg = prev.length >= 3 ? prev.reduce((a, b) => a + b, 0) / prev.length : null;
  const diff = avg !== null && prevAvg !== null ? Math.round(avg - prevAvg) : null;

  const slides: Slide[] = [{
    kind: "sleep", title: "Сон",
    big: avg !== null ? dur(avg) : "—",
    sub: avg === null ? "отбой не отмечался — длительность неизвестна"
      : diff === null || Math.abs(diff) < 10 ? "в среднем за ночь"
      : `в среднем за ночь · на ${Math.abs(diff)} мин ${diff > 0 ? "больше" : "меньше"} прошлой недели`,
    bars: mins.map(m => (m === null ? 0 : Math.min(1, m / Math.max(targetSleepMin, 1)))),
  }];

  const marked = days.filter(r => r?.food?.followed !== undefined);
  const followed = marked.filter(r => r!.food!.followed).length;
  if (marked.length) {
    slides.push({
      kind: "food", title: "Еда", big: `${followed} из ${marked.length}`, sub: "дней прошли по плану",
      bars: days.map(r => (r?.food?.followed ? 1 : r?.food ? 0.35 : 0)),
    });
  }

  const kg = days.flatMap(r => (typeof r?.body?.weightKg === "number" ? [r.body.weightKg] : []));
  if (kg.length >= 2) {
    const delta = Math.round((kg[kg.length - 1]! - kg[0]!) * 10) / 10;
    slides.push({
      kind: "weight", title: "Вес",
      big: `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(delta).toFixed(1)} кг`,
      sub: `${kg[0]} → ${kg[kg.length - 1]} кг. За неделю вода колеблется на полкило — смотри на месяц`,
    });
  }

  const rough = days.map((r, i) => (r?.sleep && isRoughNight({
    quality: r.sleep.quality, targetSleepMin, ...(mins[i] !== null ? { sleptMin: mins[i]! } : {}),
  }) ? DOW[i] : null)).filter((x): x is string => !!x);
  slides.push({
    kind: "noticed", title: "Что заметили",
    big: rough.length ? `${rough.length} ${rough.length === 1 ? "плохая ночь" : rough.length < 5 ? "плохие ночи" : "плохих ночей"}` : "Ровная неделя",
    sub: rough.length ? `${rough.join(", ")} — в эти дни план был проще, калории те же` : "ни одной плохой ночи — так держать",
  });

  slides.push({
    kind: "next", title: "Дальше",
    big: avg !== null && avg < targetSleepMin - 20 ? "Ложись на 20 минут раньше" : "Тот же ритм",
    sub: avg !== null && avg < targetSleepMin - 20
      ? "до цели по сну не хватает — двадцать минут в неделю закрывают это без насилия"
      : "сон и еда держатся — менять ничего не нужно",
  });
  return slides;
}
