import React, { useState } from "react";
import type { Profile, ScreenerResult, ScreenerAnswers, Chronotype } from "../index.js";
import { runScreener } from "../index.js";
import { buildProfile, formFromProfile, isValidTime, type OnboardingForm } from "./onboardingModel.js";

const emptyScreener: ScreenerAnswers = {
  loudSnoringWithPauses: false, daytimeSleepyDespiteEnoughSleep: false,
  legUrgeToMoveEvening: false, insomnia3xWeek3Months: false, lowMood2Weeks: false, selfHarmThoughts: false,
};

/**
 * Запущено ли приложение с домашнего экрана, а не из браузера.
 *
 * Это не косметика: у установленной на «Домой» PWA на iOS **своё хранилище**, отдельное
 * от Safari. Проверено в симуляторе iOS 27 — приложение, установленное после прохождения
 * настройки в Safari, открылось с чистого листа. Значит и данные pospat/oheedet,
 * которые миграция подхватывает из общего origin, сюда сами не попадут.
 *
 * Человек, который этого не знает, увидит пустоту и решит, что потерял всё.
 */
const isStandalone = (): boolean => {
  try {
    return window.matchMedia?.("(display-mode: standalone)").matches
      || (window.navigator as { standalone?: boolean }).standalone === true;
  } catch { return false; }
};

export function Onboarding({ initial, onDone, onRestore }: {
  initial?: Profile;
  onDone: (p: Profile, s: ScreenerResult) => void;
  /** Загрузить копию прямо здесь — иначе совету «перенеси копией» негде сбыться. */
  onRestore?: () => void;
}) {
  const [form, setForm] = useState<OnboardingForm>(initial ? formFromProfile(initial) : {
    wakeHM: "07:00", bedHM: "23:00", chronotype: "intermediate",
    caffeineMg: 95, caffeineRegular: true, napPossible: true,
  });
  const [scr, setScr] = useState<ScreenerAnswers>(emptyScreener);
  const set = (patch: Partial<OnboardingForm>) => setForm({ ...form, ...patch });
  const setS = (patch: Partial<ScreenerAnswers>) => setScr({ ...scr, ...patch });

  return (
    <main className="wrap">
      <h1>Настройка</h1>
      <p className="muted">Пара вопросов — и построим твой план дня.</p>

      {/* Видно только тем, кто открыл приложение с домашнего экрана: у установленной
          версии на iOS своё хранилище, и данные из Safari в неё не переезжают. */}
      {!initial && isStandalone() && onRestore && (
        <section className="card">
          <h3 className="card-h">Уже пользовался в браузере?</h3>
          <p className="small">
            У приложения, добавленного на «Домой», <b>отдельная память</b> — так устроен iOS.
            Данные из Safari сюда сами не переедут, их нужно перенести файлом.
          </p>
          <p className="small muted">
            В Safari открой тот же адрес → «Я» → «Сохранить». Потом вернись сюда и загрузи файл.
          </p>
          <button className="chip" onClick={onRestore}>Загрузить копию</button>
        </section>
      )}

      <label className="fld">Обычное время подъёма
        <input type="time" value={form.wakeHM} onChange={e=>set({ wakeHM: e.target.value })} />
      </label>
      <label className="fld">Обычное время, когда ложишься спать
        <input type="time" value={form.bedHM} onChange={e=>set({ bedHM: e.target.value })} />
      </label>
      <label className="fld">Когда тебя по природе тянет спать и вставать
        <select value={form.chronotype} onChange={e=>set({ chronotype: e.target.value as Chronotype })}>
          <option value="early">Рано ложусь и рано встаю (жаворонок)</option>
          <option value="intermediate">Как большинство, средне</option>
          <option value="late">Поздно ложусь, тяжело вставать рано (сова)</option>
        </select>
      </label>
      <p className="muted small">Ориентируйся на выходные без будильника: когда сам засыпаешь и просыпаешься.</p>
      <label className="fld">Сколько кофеина обычно за раз
        <select value={form.caffeineMg} onChange={e=>set({ caffeineMg: Number(e.target.value) })}>
          <option value={0}>Не пью кофеин</option>
          <option value={35}>Кола или зелёный чай (~35 мг)</option>
          <option value={60}>Чёрный чай, растворимый кофе или 1 эспрессо (~60 мг)</option>
          <option value={95}>Чашка кофе 200–250 мл или банка Red Bull 250 мл (~95 мг)</option>
          <option value={150}>Двойной кофе или большой энергетик 0.5 л (~150 мг)</option>
        </select>
      </label>
      <p className="muted small">Не знаешь мг — просто выбери, что похоже на твою чашку.</p>
      <label className="chk"><input type="checkbox" checked={form.caffeineRegular}
        onChange={e=>set({ caffeineRegular: e.target.checked })} /> Пью кофеин ежедневно</label>
      <label className="chk"><input type="checkbox" checked={form.napPossible}
        onChange={e=>set({ napPossible: e.target.checked })} /> Могу вздремнуть днём</label>
      <h2>Короткая проверка здоровья</h2>
      <label className="chk"><input type="checkbox" checked={scr.loudSnoringWithPauses}
        onChange={e=>setS({ loudSnoringWithPauses: e.target.checked })} /> Громкий храп с паузами дыхания</label>
      <label className="chk"><input type="checkbox" checked={scr.daytimeSleepyDespiteEnoughSleep}
        onChange={e=>setS({ daytimeSleepyDespiteEnoughSleep: e.target.checked })} /> Сильно клонит в сон днём даже выспавшись</label>
      <label className="chk"><input type="checkbox" checked={scr.legUrgeToMoveEvening}
        onChange={e=>setS({ legUrgeToMoveEvening: e.target.checked })} /> Неприятные ощущения в ногах по вечерам</label>
      <label className="chk"><input type="checkbox" checked={scr.insomnia3xWeek3Months}
        onChange={e=>setS({ insomnia3xWeek3Months: e.target.checked })} /> Плохо сплю (трудно заснуть или просыпаюсь) 3+ ночей в неделю — и так уже 3+ месяца</label>
      <label className="chk"><input type="checkbox" checked={scr.lowMood2Weeks}
        onChange={e=>setS({ lowMood2Weeks: e.target.checked })} /> Подавленное настроение 2 недели и дольше</label>
      <label className="chk"><input type="checkbox" checked={scr.selfHarmThoughts}
        onChange={e=>setS({ selfHarmThoughts: e.target.checked })} /> Есть мысли причинить себе вред</label>

      {/* Пустое поле времени — не мелочь: на нём приложение падало прямо по этой кнопке */}
      {(!isValidTime(form.wakeHM) || !isValidTime(form.bedHM)) && (
        <p className="note-warn small">
          Заполни время подъёма и отбоя — от них считается весь план дня.
        </p>
      )}
      <button className="primary"
        disabled={!isValidTime(form.wakeHM) || !isValidTime(form.bedHM)}
        onClick={() => onDone(buildProfile(form), runScreener(scr))}>
        Построить план
      </button>
      <p className="disclaimer">«edim & spim» — не медицинское приложение. При нарушениях сна или питания обратись к врачу.</p>
    </main>
  );
}
