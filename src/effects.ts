import type { DayLog } from "./types.js";
import { sleepDurationMin } from "./readiness.js";

/**
 * «Вчера было?» и личный эффект — как журнал WHOOP (research-2.0/competitors.md).
 *
 * Утром человек отвечает «да / нет» про вчерашний вечер, и через пару недель приложение
 * показывает, как это сказалось именно на нём: «после поздних ужинов ты спишь на 25 минут
 * меньше». Это НАБЛЮДЕНИЕ, а не вывод о причинах: на десятке ночей статистики нет, а
 * поздний ужин мог совпасть с поздним отбоем. Поэтому — без процентов и p-значений,
 * и только когда с каждой стороны набралось хотя бы пять ночей.
 *
 * Ответы за дату D относятся к ночи перед D — той, после которой человек проснулся в D.
 */
export interface Yesterday { lateDinner?: boolean; lateCaffeine?: boolean; alcohol?: boolean }

export type Factor = "lateDinner" | "lateCaffeine" | "alcohol";
export interface Effect {
  factor: Factor;
  yes: number;
  no: number;
  ready: boolean;
  qualityDiff?: number;
  sleepDiffMin?: number;
  textRU?: string;
}

const MIN_EACH = 5;
const MIN_DURATIONS = 3;
const SLEEP_NOTICE_MIN = 10;
const QUALITY_NOTICE = 0.3;

const AFTER: Record<Factor, string> = {
  lateDinner: "после поздних ужинов",
  lateCaffeine: "после кофе после 14:00",
  alcohol: "после алкоголя",
};

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function personalEffects(history: DayLog[], yesterday: Record<string, Yesterday>, targetSleepMin: number): Effect[] {
  return (Object.keys(AFTER) as Factor[]).map(factor => {
    const answer = (h: DayLog): boolean | undefined => {
      const y = yesterday[h.date]?.[factor];
      return factor === "alcohol" ? (y ?? h.hadAlcohol) : y;
    };
    const yes = history.filter(h => answer(h) === true);
    // для алкоголя «нет» — и явный ответ, и ночь без отметки алкоголя: его отмечают, только когда он был
    const no = history.filter(h => factor === "alcohol" ? answer(h) !== true : answer(h) === false);
    const e: Effect = { factor, yes: yes.length, no: no.length, ready: yes.length >= MIN_EACH && no.length >= MIN_EACH };
    if (!e.ready) return e;

    const durs = (hs: DayLog[]) => hs.filter(h => h.bedHM).map(h => sleepDurationMin(h, targetSleepMin));
    const dy = durs(yes), dn = durs(no);
    if (dy.length >= MIN_DURATIONS && dn.length >= MIN_DURATIONS) e.sleepDiffMin = Math.round(mean(dy) - mean(dn));
    e.qualityDiff = Math.round((mean(yes.map(h => h.quality)) - mean(no.map(h => h.quality))) * 10) / 10;

    const parts: string[] = [];
    if (e.sleepDiffMin !== undefined && Math.abs(e.sleepDiffMin) >= SLEEP_NOTICE_MIN) {
      parts.push(`ты спишь в среднем на ${Math.abs(e.sleepDiffMin)} мин ${e.sleepDiffMin < 0 ? "меньше" : "больше"}`);
    } else if (Math.abs(e.qualityDiff) >= QUALITY_NOTICE) {
      parts.push(`оценка сна ${e.qualityDiff < 0 ? "ниже" : "выше"} на ${Math.abs(e.qualityDiff).toFixed(1)}`);
    }
    e.textRU = `${AFTER[factor]} ${parts.length ? parts.join(", ") : "заметной разницы нет"}`;
    return e;
  });
}
