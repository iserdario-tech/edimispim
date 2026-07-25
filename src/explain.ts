import type { DayRecord } from "./day-log.js";
import type { DayLog } from "./types.js";
import { regularityScore } from "./regularity.js";
import { sleepDurationMin } from "./readiness.js";

/**
 * Объяснитель — то, ради чего два приложения объединялись.
 *
 * Отвечает на «почему сегодня так» одним сообщением, глядя одновременно на сон, еду и вес.
 * Ни pospat, ни oheedet по отдельности этих связей не видят.
 *
 * Рамка (продуктовые выводы A1, A3, H3):
 * - сон НЕ сжигает калории — он меняет аппетит, самоконтроль и СОСТАВ потерянного веса;
 * - сопоставления подаются как наблюдение, а не как вывод; никаких коэффициентов.
 */

export type ExplanationKind =
  | "red_flag" | "rough_night" | "alcohol" | "scale_truth" | "anchor" | "steady";

export interface Explanation {
  kind: ExplanationKind;
  textRU: string;
}

export interface ExplainInput {
  today: DayRecord;
  days: DayRecord[];              // включая сегодня
  targetSleepMin: number;
  screenerFlagged?: boolean;
  caffeineCutoffHM?: string;      // для подсказки про кофеин
}

const DAY_MS = 86_400_000;
const daysAgo = (todayISO: string, iso: string): number =>
  Math.round((Date.parse(todayISO) - Date.parse(iso)) / DAY_MS);

/** Суточные записи → формат движка сна, чтобы переиспользовать regularityScore. */
export function toSleepLogs(days: DayRecord[]): DayLog[] {
  return days
    .filter(d => d.sleep)
    .map(d => ({
      date: d.date,
      wokeHM: d.sleep!.wokeHM,
      bedHM: d.sleep!.bedHM,
      quality: d.sleep!.quality,
      hadAlcohol: d.sleep!.alcohol,
    }));
}

const hhmm = (min: number): string =>
  `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;

function window(days: DayRecord[], todayISO: string, n: number): DayRecord[] {
  return days.filter(d => {
    const ago = daysAgo(todayISO, d.date);
    return ago >= 0 && ago < n;
  });
}

/** Единственное сообщение на сегодня: первое подошедшее правило. */
export function explain(input: ExplainInput): Explanation {
  const { today, days, targetSleepMin, screenerFlagged } = input;
  const logs = toSleepLogs(days);
  const last7 = window(days, today.date, 7);

  // 1. Красный флаг перебивает всё остальное.
  if (screenerFlagged) {
    return {
      kind: "red_flag",
      textRU: "По ответам в анкете есть повод показаться врачу. Это важнее любого плана питания — приложение не ставит диагнозов и не заменяет приём.",
    };
  }

  const night = today.sleep;
  const sleptMin = night?.bedHM
    ? sleepDurationMin({ wokeHM: night.wokeHM, bedHM: night.bedHM, quality: night.quality }, targetSleepMin)
    : undefined;
  const roughByLength = sleptMin !== undefined && sleptMin < targetSleepMin - 60;
  const roughByQuality = night !== undefined && night.quality <= 2;
  const roughToday = roughByLength || roughByQuality;

  const planTail = roughToday
    ? " План на сегодня уже проще: готовки меньше, основная еда раньше, лакомство передвинуто на вечер."
    : "";

  // 2. Правда про весы (A1) — главное, чего не может сказать ни одно приложение по отдельности.
  //
  // Стоит ВЫШЕ правила про плохую ночь намеренно. При хроническом недосыпе — а это и есть
  // тот случай, когда предупреждение нужнее всего — каждый день срабатывало бы правило 3,
  // и человек никогда бы не услышал главного. Само правило редкое: нужны два замера веса,
  // четыре ночи с отбоем, падение веса и недосыпная неделя.
  const scale = scaleTruth(last7, targetSleepMin);
  if (scale) return { ...scale, textRU: scale.textRU + planTail };

  // 3. Плохая ночь: аппетит выше, самоконтроль ниже (S-032, X24). План уже перестроен.
  if (roughToday) {
    const howMuch = sleptMin !== undefined ? `Сон ${hhmm(sleptMin)}` : "Ночь вышла тяжёлой";
    const coffee = input.caffeineCutoffHM ? ` Кофе — до ${input.caffeineCutoffHM}.` : "";
    return {
      kind: "rough_night",
      textRU: `${howMuch}, качество ${night?.quality ?? "?"} из 5. Сегодня будет сильнее тянуть на сладкое и жирное — это физиология недосыпа, а не слабость характера.${planTail}${coffee}`,
    };
  }

  // 4. Алкоголь прошлой ночью: двойная цена (X12, F2). Не запрет, а прайслист.
  if (night?.alcohol) {
    return {
      kind: "alcohol",
      textRU: "Вчера был алкоголь. Цена двойная: калории, которые не компенсируются меньшей едой, и подавленный REM-сон — уже с двух порций. Сегодня аппетит будет выше обычного, так что план сделан сытнее в первой половине дня.",
    };
  }

  // 5. Якорь: регулярность связана с результатом (D1, D2).
  if (logs.length >= 4 && regularityScore(logs) < 60) {
    return {
      kind: "anchor",
      textRU: "Время подъёма за неделю сильно гуляет. Стабильный режим связан с результатом не меньше, чем сама диета — попробуй держать подъём в пределах часа даже в выходные.",
    };
  }

  return {
    kind: "steady",
    textRU: "Ночь нормальная, план на день обычный. Основная еда — в первой половине дня, ужин за три часа до отбоя.",
  };
}

/**
 * Вес снижается, но неделя недосыпная → предупредить о составе потери.
 * При недосыпе доля жира в потерянном весе падает на 55%, потеря мышц растёт на 60% (B-001),
 * и это воспроизводится при потере всего часа сна пять ночей в неделю (B-002).
 */
function scaleTruth(last7: DayRecord[], targetSleepMin: number): Explanation | null {
  const weights = last7.filter(d => typeof d.body?.weightKg === "number");
  if (weights.length < 2) return null;
  const first = weights[0]!.body!.weightKg!;
  const last = weights[weights.length - 1]!.body!.weightKg!;
  if (last >= first) return null;                      // вес не снижается — правило не про это

  const nights = last7.filter(d => d.sleep?.bedHM);
  if (nights.length < 4) return null;                  // мало данных, чтобы делать заявление
  const avgSleep = nights.reduce((s, d) =>
    s + sleepDurationMin({ wokeHM: d.sleep!.wokeHM, bedHM: d.sleep!.bedHM, quality: d.sleep!.quality }, targetSleepMin), 0) / nights.length;
  if (avgSleep >= targetSleepMin - 45) return null;    // сон в порядке — предупреждать не о чем

  return {
    kind: "scale_truth",
    textRU: `Вес снизился на ${(first - last).toFixed(1)} кг — но средний сон за неделю ${hhmm(Math.round(avgSleep))}. В исследованиях при таком сне тот же минус на весах состоит из другого: жира уходит заметно меньше, а мышц — больше. Весы этого не показывают. Добавить сна сейчас важнее, чем ужать калории.`,
  };
}
