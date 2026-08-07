import type { DayRecord } from "./day-log.js";
import { parseHM } from "./time.js";
import { sleepDurationMin } from "./readiness.js";
import { regularityScore } from "./regularity.js";
import { toSleepLogs } from "./explain.js";

/**
 * «Якорь» — насколько ровно держится режим.
 *
 * Почему это отдельная метрика, а не украшение:
 * - высокая вариабельность сна предсказывает ослабленный ответ на похудение (X6, B-010);
 * - социальный джетлаг связан с ИМТ, жировой массой и талией — мета-анализ 43 работ,
 *   231 648 участников (X13, B-016);
 * - хаотичный режим питания связан с худшими метаболическими исходами (X18, B-021).
 *
 * ⚠️ Всё это НАБЛЮДАТЕЛЬНЫЕ данные, поэтому формулировки говорят «связано», а не «приводит».
 * И обосновывать регулярность механизмом периферийных часов нельзя: бытовые колебания
 * времени еды слишком малы, чтобы сдвигать фазу (X14, B-045).
 */

/** Середина сна — общепринятая точка отсчёта для социального джетлага. */
export function midsleepMin(bedHM: string, wokeHM: string, targetSleepMin: number): number {
  const bed = parseHM(bedHM);
  const dur = sleepDurationMin({ bedHM, wokeHM, quality: 3 }, targetSleepMin);
  return ((bed + dur / 2) % 1440 + 1440) % 1440;
}

/** Разница двух моментов суток по кругу: 23:50 и 00:30 отличаются на 40 минут, а не на 1400. */
export function circularDiffMin(a: number, b: number): number {
  const d = Math.abs(a - b) % 1440;
  return Math.min(d, 1440 - d);
}

const isWeekend = (iso: string): boolean => {
  const dow = new Date(iso + "T00:00:00Z").getUTCDay();
  return dow === 0 || dow === 6;
};

export interface AnchorResult {
  /**
   * 0..100 — единый показатель, который и показываем. `null`, пока ночей слишком мало.
   *
   * Раньше здесь всегда стояло число, и человек, не отметивший ни одной ночи, видел
   * «100 из 100» — идеальную ровность режима, о котором приложение не знало ничего.
   * Выдуманная цифра хуже отсутствующей: она выглядит как достижение и обесценивает
   * настоящие сто баллов у того, кто их заработал.
   */
  score: number | null;
  regularity: number | null;       // 0..100 по времени подъёма; null — ночей меньше четырёх
  socialJetlagMin: number | null;  // null — не хватает будних или выходных ночей
  weekdayMidsleep: number | null;
  weekendMidsleep: number | null;
  verdictRU: string;
}

/**
 * Джетлаг в баллы: 0 минут → 100, три часа и больше → 0.
 * Три часа взяты как потолок, потому что дальше разница уже сопоставима со сменой
 * часового пояса, и различать 4 часа и 5 практического смысла не имеет.
 */
const JETLAG_ZERO_AT_MIN = 180;
const jetlagScore = (min: number): number =>
  Math.max(0, Math.round(100 - (min / JETLAG_ZERO_AT_MIN) * 100));

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const hm = (min: number): string =>
  `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(Math.round(min % 60)).padStart(2, "0")}`;

/** Сколько ночей каждого типа нужно, чтобы вообще говорить о джетлаге. */
const MIN_NIGHTS = 2;

/**
 * Сколько ночей нужно, чтобы вообще называть цифру ровности.
 *
 * Четыре — не круглое число с потолка: ровно столько приложение просит в «Что дальше»
 * («с четырёх ночей уже видно, ровно ли держится режим»). Два экрана не должны
 * расходиться в том, когда данных достаточно.
 */
const MIN_NIGHTS_FOR_SCORE = 4;

export function anchor(days: DayRecord[], targetSleepMin: number): AnchorResult {
  const withSleep = days.filter(d => d.sleep?.bedHM);
  const logs = toSleepLogs(days);
  const regularity = regularityScore(logs);
  const enough = logs.length >= MIN_NIGHTS_FOR_SCORE;

  const mid = (list: DayRecord[]) =>
    list.map(d => midsleepMin(d.sleep!.bedHM!, d.sleep!.wokeHM, targetSleepMin));

  const weekdays = mid(withSleep.filter(d => !isWeekend(d.date)));
  const weekends = mid(withSleep.filter(d => isWeekend(d.date)));

  if (weekdays.length < MIN_NIGHTS || weekends.length < MIN_NIGHTS) {
    return {
      // пока сравнивать не с чем — показываем ровность подъёма, но только если ночей хватает
      score: enough ? regularity : null,
      regularity,
      socialJetlagMin: null,
      weekdayMidsleep: weekdays.length ? mean(weekdays) : null,
      weekendMidsleep: weekends.length ? mean(weekends) : null,
      verdictRU: enough
        ? "Отмечай и будни, и выходные — тогда покажу, насколько разъезжается режим."
        : `Отметь ещё ${MIN_NIGHTS_FOR_SCORE - logs.length} ноч${nightsPlural(MIN_NIGHTS_FOR_SCORE - logs.length)} — с четырёх уже видно, ровно ли держится режим.`,
    };
  }

  const wd = mean(weekdays);
  const we = mean(weekends);
  const jetlag = Math.round(circularDiffMin(wd, we));

  return {
    // Берём ХУДШЕЕ из двух, а не среднее и не одну лишь регулярность.
    // Причина: `regularityScore` считает медианное отклонение, а оно устойчиво к выбросам —
    // два выходных из семи не сдвигают медиану, и подъём на три часа позже по субботам
    // давал честные «100 из 100» прямо рядом с надписью «разъезд 2 часа».
    // Одна цифра не должна противоречить другой на том же экране.
    score: regularity === null ? null : Math.min(regularity, jetlagScore(jetlag)),
    regularity,
    socialJetlagMin: jetlag,
    weekdayMidsleep: wd,
    weekendMidsleep: we,
    verdictRU: verdict(jetlag, we > wd),
  };
}

const nightsPlural = (n: number): string => (n === 1 ? "ь" : n < 5 ? "и" : "ей");

function verdict(jetlagMin: number, weekendLater: boolean): string {
  const h = (jetlagMin / 60).toFixed(1).replace(".0", "");
  if (jetlagMin < 60) {
    return `Режим ровный: будни и выходные расходятся всего на ${jetlagMin} мин. Это заметно помогает — стабильность связана с результатом не меньше, чем сама диета.`;
  }
  if (jetlagMin < 120) {
    return `Выходные живут на ${h} ч ${weekendLater ? "позже" : "раньше"} будней. Небольшой сдвиг, но если хочется прибавки — начинать проще с него, чем с урезания еды.`;
  }
  return `Выходные живут на ${h} ч ${weekendLater ? "позже" : "раньше"} будней — телу это примерно как перелёт через несколько часовых поясов каждую неделю. В наблюдениях такой сдвиг связан с бо́льшим весом и объёмом талии.`;
}

/** Человеческое описание разъезда, для экрана недели. */
export const anchorSummaryRU = (a: AnchorResult): string =>
  a.socialJetlagMin == null
    ? a.verdictRU
    : `Будни: середина сна ${hm(a.weekdayMidsleep!)} · выходные: ${hm(a.weekendMidsleep!)}`;
