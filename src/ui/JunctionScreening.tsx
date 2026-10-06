import { nightEating, type StopBangAnswers, type NesAnswers } from "../screening.js";

/**
 * Скрининг стыка: апноэ сна и ночное питание. Оба видны только когда сон и еда
 * смотрятся вместе — поодиночке ни pospat, ни oheedet их поймать не могли.
 *
 * Вопросов всего тринадцать, но подряд их никто не задаёт: сначала два «ворот».
 * Ответил «нет» — секция закончилась, ответил «да» — доспросим остальное.
 * Apple называет это прогрессивным раскрытием: большинству эта часть стоит пяти секунд.
 *
 * Вынесено из формы еды, когда появился быстрый старт: вопросы должны быть одни и те же
 * в обоих местах, иначе ночное питание у новичка не смягчало бы дефицит.
 */
export interface JunctionValue {
  apneaGate: boolean;
  apnea: Omit<StopBangAnswers, "snoringLoud">;
  nesGate: boolean;
  nes: Omit<NesAnswers, "eveningHyperphagia" | "nightEatingTwicePlus">;
}

export function junctionFrom(initial?: { stopBang?: StopBangAnswers; nes?: NesAnswers }): JunctionValue {
  const sb = initial?.stopBang, ne = initial?.nes;
  return {
    apneaGate: !!sb?.snoringLoud,
    apnea: {
      tiredDaytime: !!sb?.tiredDaytime, observedApnea: !!sb?.observedApnea,
      highBloodPressure: !!sb?.highBloodPressure, neckOver40cm: !!sb?.neckOver40cm,
    },
    nesGate: !!(ne?.eveningHyperphagia || ne?.nightEatingTwicePlus),
    nes: {
      morningAnorexia: !!ne?.morningAnorexia, urgeToEatBeforeSleep: !!ne?.urgeToEatBeforeSleep,
      insomnia: !!ne?.insomnia, mustEatToSleep: !!ne?.mustEatToSleep,
      eveningMoodDrop: !!ne?.eveningMoodDrop, distress: !!ne?.distress,
    },
  };
}

/** Ответы для хранения и флаг ночного питания — на нём дефицит смягчается. */
export function junctionResult(v: JunctionValue) {
  const nes: NesAnswers = { eveningHyperphagia: v.nesGate, nightEatingTwicePlus: v.nesGate, ...v.nes };
  return {
    screening: { stopBang: { snoringLoud: v.apneaGate, ...v.apnea }, nes },
    nesFlagged: nightEating(nes).flagged,
  };
}

export function JunctionScreening({ value, onChange }: { value: JunctionValue; onChange: (v: JunctionValue) => void }) {
  const set = (patch: Partial<JunctionValue>) => onChange({ ...value, ...patch });
  return (
    <>
      <label className="chk">
        <input type="checkbox" checked={value.apneaGate} onChange={e => set({ apneaGate: e.target.checked })} />
        Громко храплю или кто-то замечал остановки дыхания во сне
      </label>
      {value.apneaGate && (
        <div className="reveal reveal-indent">
          {([
            ["tiredDaytime", "Днём разбитость даже после долгого сна"],
            ["observedApnea", "Кто-то замечал именно остановки дыхания"],
            ["highBloodPressure", "Высокое давление или лечусь от него"],
            ["neckOver40cm", "Окружность шеи больше 40 см"],
          ] as const).map(([key, ru]) => (
            <label key={key} className="chk">
              <input type="checkbox" checked={!!value.apnea[key]}
                onChange={e => set({ apnea: { ...value.apnea, [key]: e.target.checked } })} />
              {ru}
            </label>
          ))}
        </div>
      )}

      <label className="chk">
        <input type="checkbox" checked={value.nesGate} onChange={e => set({ nesGate: e.target.checked })} />
        Просыпаюсь ночью поесть или основная еда уходит на вечер
      </label>
      {value.nesGate && (
        <div className="reveal reveal-indent">
          {([
            ["morningAnorexia", "Утром есть не хочется"],
            ["urgeToEatBeforeSleep", "Между ужином и сном тянет есть"],
            ["insomnia", "Сон рваный: трудно заснуть или просыпаюсь"],
            ["mustEatToSleep", "Кажется, что без еды не усну"],
            ["eveningMoodDrop", "К вечеру настроение хуже"],
            ["distress", "Меня это беспокоит и мешает жить"],
          ] as const).map(([key, ru]) => (
            <label key={key} className="chk">
              <input type="checkbox" checked={!!value.nes[key]}
                onChange={e => set({ nes: { ...value.nes, [key]: e.target.checked } })} />
              {ru}
            </label>
          ))}
        </div>
      )}
    </>
  );
}
