/**
 * Скрининги стыка: апноэ сна (STOP-Bang) и синдром ночного питания (NES).
 *
 * Оба живут ровно на границе двух приложений и поодиночке не видны:
 * - апноэ ↔ ожирение двунаправлены, и снижение веса реально лечит апноэ (X19, X23);
 * - NES наполовину про сон, наполовину про еду; при ожирении это 6–16 % (X21).
 *
 * ⚠️ Скрининг — НЕ диагноз. Результат ведёт к врачу, а не к выводу приложения (G3).
 *
 * Подключён к форме еды (раздел «Короткая проверка») решением Сердара 2026-08-08 — до этого модуль был написан,
 * обоснован и мёртв: вопросов никто не задавал. Вопросов тринадцать, но подряд их никто
 * не видит: сначала два «ворот» («громко храплю…», «просыпаюсь ночью поесть…»), и остальное
 * раскрывается только при «да». Вердикты собирает `healthFlags.ts` и показывает только при флаге:
 * карточкой на «Сутках» и разделом в «Я → Как ты спишь» (вкладки «Итоги», где они жили до 2.0,
 * больше нет — после переезда вердикт апноэ не показывался вовсе). Ночное питание вдобавок
 * смягчает дефицит через `applySafety`.
 */

export interface StopBangAnswers {
  snoringLoud: boolean;          // S — громкий храп
  tiredDaytime: boolean;         // T — дневная усталость, сонливость
  observedApnea: boolean;        // O — кто-то замечал остановки дыхания
  highBloodPressure: boolean;    // P — высокое давление или лечение от него
  neckOver40cm: boolean;         // N — окружность шеи больше 40 см
}

export interface StopBangContext {
  bmi: number;                   // B — считаем сами из профиля
  age: number;                   // A
  sex: "m" | "f";                // G
}

export interface ScreenResult {
  flagged: boolean;
  score: number;
  levelRU: string;
  messageRU: string;
}

/**
 * STOP-Bang: 8 признаков. Три из них (ИМТ, возраст, пол) считаются из профиля —
 * спрашивать их отдельно незачем, онбординг и так длинный.
 * Порог: 0–2 низкий риск, 3–4 средний, 5+ высокий.
 */
export function stopBang(a: StopBangAnswers, ctx: StopBangContext): ScreenResult {
  const score =
    Number(a.snoringLoud) + Number(a.tiredDaytime) + Number(a.observedApnea) +
    Number(a.highBloodPressure) + Number(a.neckOver40cm) +
    Number(ctx.bmi > 35) + Number(ctx.age > 50) + Number(ctx.sex === "m");

  // про вес — только тем, у кого он и правда лишний: человеку с обычным весом совет худеть от апноэ ни к чему
  const weight = ctx.bmi >= 30 ? " Лишний вес и апноэ усиливают друг друга, и снижение веса при апноэ реально помогает." : "";
  if (score >= 5) {
    return {
      flagged: true, score, levelRU: "высокий",
      messageRU: `Ответы указывают на заметный риск остановок дыхания во сне (апноэ). Это стоит обсудить с врачом: при апноэ сон не восстанавливает силы. Приложение не ставит диагнозов.${weight}`,
    };
  }
  if (score >= 3) {
    return {
      flagged: true, score, levelRU: "средний",
      messageRU: `Есть несколько признаков возможного апноэ сна. Это стоит проверить у врача: апноэ лечится, и тогда сон снова начинает восстанавливать.${weight}`,
    };
  }
  return { flagged: false, score, levelRU: "низкий", messageRU: "" };
}

/** Текст про ночное питание — один и для свежих ответов, и для флага, перенесённого из oheedet без ответов. */
export const NES_MESSAGE = "Похоже на устойчивый паттерн: основная еда сдвинута на вечер и ночь. Это описанное состояние, и с ним работают специалисты — жёсткая диета тут обычно делает хуже. Поэтому дефицит в приложении мягче обычного, а разговор со специалистом будет полезнее любого меню.";

export interface NesAnswers {
  eveningHyperphagia: boolean;   // ≥25 % суточной еды после ужина
  nightEatingTwicePlus: boolean; // ≥2 эпизодов ночной еды в неделю (с осознанием)
  morningAnorexia: boolean;      // утром есть не хочется
  urgeToEatBeforeSleep: boolean; // сильное желание есть между ужином и сном
  insomnia: boolean;
  mustEatToSleep: boolean;       // убеждение «надо поесть, чтобы уснуть»
  eveningMoodDrop: boolean;      // настроение хуже к вечеру
  distress: boolean;             // это мешает жить
}

/**
 * NES: обязателен основной признак (вечерняя гиперфагия ИЛИ ночная еда),
 * плюс не менее трёх сопутствующих, плюс дистресс.
 */
export function nightEating(a: NesAnswers): ScreenResult {
  const core = a.eveningHyperphagia || a.nightEatingTwicePlus;
  const supporting =
    Number(a.morningAnorexia) + Number(a.urgeToEatBeforeSleep) +
    Number(a.insomnia) + Number(a.mustEatToSleep) + Number(a.eveningMoodDrop);
  const flagged = core && supporting >= 3 && a.distress;

  return {
    flagged,
    score: supporting + Number(core),
    levelRU: flagged ? "паттерн совпадает" : "паттерн не выражен",
    messageRU: flagged ? NES_MESSAGE : "",
  };
}
