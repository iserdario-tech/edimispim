import { useState } from "react";
import type { Profile, ScreenerAnswers, ScreenerResult } from "../index.js";
import { runScreener } from "../index.js";
import type { Sex } from "../food/types.js";
import { DEFAULT_PACE } from "../food/rampin.js";
import type { FoodSettings } from "./storage.js";
import { buildProfile, isValidTime } from "./onboardingModel.js";
import { emptyScreener } from "./Onboarding.js";
import { checkProfile, NumInput } from "./FoodSetup.js";
import { JunctionScreening, junctionFrom, junctionResult } from "./JunctionScreening.js";
import { isStandalone } from "./dataSafety.js";
import { localDateISO } from "../today-date.js";

/**
 * Быстрый старт для нового человека: три коротких шага — и сразу готовый день с едой.
 *
 * Раньше до главного — еды под сон — было две длинные формы: сначала сон (хронотип,
 * кофеин, проверка здоровья), потом отдельно еда (восемь блоков). Друзья, которым
 * Сердар даёт ссылку, до меню просто не доходили. Теперь спрашиваем только то, без чего
 * не посчитать день; остальное ставится по умолчанию и донастраивается потом.
 *
 * Проверку здоровья НЕ откладываем: в ней храп с остановками дыхания, подавленность,
 * мысли о вреде себе и ночное питание — при дефиците калорий это нельзя пропустить.
 */
export function QuickStart({ onDone, onRestore }: {
  onDone: (p: Profile, s: ScreenerResult, food: FoodSettings) => void;
  onRestore?: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [wakeHM, setWakeHM] = useState("07:00");
  const [bedHM, setBedHM] = useState("23:00");
  const [sex, setSex] = useState<Sex>("m");
  const [age, setAge] = useState(30);
  const [heightCm, setHeightCm] = useState(175);
  const [weightKg, setWeightKg] = useState(80);
  const [goalWeightKg, setGoalWeightKg] = useState(75);
  const [scr, setScr] = useState<ScreenerAnswers>(emptyScreener);
  const [junction, setJunction] = useState(() => junctionFrom());
  const problems = checkProfile({ age, heightCm, weightKg, goalWeightKg });
  const timesOk = isValidTime(wakeHM) && isValidTime(bedHM);

  const finish = () => {
    const profile = buildProfile({ wakeHM, bedHM, chronotype: "intermediate", caffeineMg: 95, caffeineRegular: true, napPossible: true });
    const j = junctionResult(junction);
    onDone(profile, runScreener(scr), {
      profile: { sex, age, heightCm, weightKg, goalWeightKg, activity: "low" },
      constraints: { allergens: [], cookware: ["stove", "oven", "microwave"], budget: "medium", cuisines: [], dislikes: [] },
      mealCount: 4,
      pace: DEFAULT_PACE,
      startISO: localDateISO(),
      screening: j.screening,
      screen: { nesFlagged: j.nesFlagged },
      // остальное поставлено по умолчанию — на «Сегодня» будет карточка «донастрой»
      tuned: false,
    });
  };

  const num = (label: string, v: number, set: (n: number) => void, decimal = false) => (
    <label className="fld small">{label}
      <NumInput inputMode={decimal ? "decimal" : "numeric"} value={v} onChange={set} />
    </label>
  );

  return (
    <main className="wrap quick">
      <div className="quick-dots" aria-label={`Шаг ${step} из 3`}>
        {[1, 2, 3].map(i => <span key={i} className={i === step ? "on" : i < step ? "done" : ""} />)}
      </div>

      {step === 1 && (
        <>
          <h1>Когда ты спишь?</h1>
          <p className="muted">От подъёма и отбоя строится весь день — и сон, и еда.</p>
          <label className="fld">Обычно встаю
            <input type="time" value={wakeHM} onChange={e => setWakeHM(e.target.value)} />
          </label>
          <label className="fld">Обычно ложусь
            <input type="time" value={bedHM} onChange={e => setBedHM(e.target.value)} />
          </label>
          <p className="small muted">Остальное про сон (сова ты или жаворонок, сколько пьёшь кофе) поставим средним — поправишь в «Я → Настройки сна».</p>
          {!timesOk && <p className="note-warn small">Заполни оба времени — от них считается весь план дня.</p>}
          <button className="primary" disabled={!timesOk} onClick={() => setStep(2)}>Дальше</button>
          {onRestore && (
            <p className="small muted">
              {isStandalone()
                ? "Уже пользовался в Safari? У установленного приложения своя память — перенеси данные файлом копии."
                : "Уже есть копия данных?"}{" "}
              <button className="linkbtn small" onClick={onRestore}>Загрузить копию</button>
            </p>
          )}
        </>
      )}

      {step === 2 && (
        <>
          <h1>Про тебя</h1>
          <p className="muted">Отсюда считается норма калорий и белка.</p>
          <div className="seg" role="group" aria-label="Пол">
            {([["m", "Мужчина"], ["f", "Женщина"]] as const).map(([v, ru]) => (
              <button key={v} className={sex === v ? "seg-item on" : "seg-item"} aria-pressed={sex === v}
                onClick={() => setSex(v)}>{ru}</button>
            ))}
          </div>
          <div className="quick-grid">
            {num("Возраст", age, setAge)}
            {num("Рост, см", heightCm, setHeightCm)}
            {num("Вес сейчас, кг", weightKg, setWeightKg, true)}
            {num("Хочу весить, кг", goalWeightKg, setGoalWeightKg, true)}
          </div>
          {problems.length > 0 && <p className="note-warn small">Проверь: {problems.join("; ")}.</p>}
          <p className="small muted">
            Аллергии, технику на кухне, бюджет и время на готовку настроишь потом в «Я → Настройки еды» — меню соберётся уже сейчас.
          </p>
          <button className="primary" disabled={problems.length > 0} onClick={() => setStep(3)}>Дальше</button>
          <button className="linkbtn" onClick={() => setStep(1)}>← назад</button>
        </>
      )}

      {step === 3 && (
        <>
          <h1>Короткая проверка здоровья</h1>
          <p className="muted small">
            Отметь, что про тебя. Это не диагноз: если что-то отмечено, приложение посоветует врача
            и не станет сильно урезать калории. Ответы остаются на телефоне.
          </p>
          {([
            ["loudSnoringWithPauses", "Громкий храп с паузами дыхания"],
            ["daytimeSleepyDespiteEnoughSleep", "Сильно клонит в сон днём, даже выспавшись"],
            ["legUrgeToMoveEvening", "Неприятные ощущения в ногах по вечерам"],
            ["insomnia3xWeek3Months", "Плохо сплю 3+ ночи в неделю — и так уже 3+ месяца"],
            ["lowMood2Weeks", "Подавленное настроение 2 недели и дольше"],
            ["selfHarmThoughts", "Есть мысли причинить себе вред"],
          ] as const).map(([k, ru]) => (
            <label key={k} className="chk">
              <input type="checkbox" checked={scr[k]} onChange={e => setScr({ ...scr, [k]: e.target.checked })} /> {ru}
            </label>
          ))}
          <JunctionScreening value={junction} onChange={setJunction} />
          <button className="primary" onClick={finish}>Готово — показать мой день</button>
          <button className="linkbtn" onClick={() => setStep(2)}>← назад</button>
        </>
      )}

      <p className="disclaimer">«edim & spim» — не медицинское приложение. При нарушениях сна или питания обратись к врачу.</p>
    </main>
  );
}
