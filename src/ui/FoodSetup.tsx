import React, { useState } from "react";
import type { FoodSettings } from "./storage.js";
import type { Activity, Budget, MealCount, Sex } from "../food/types.js";
import { DEFAULT_PACE, RAMP_DAYS, type RampPace } from "../food/rampin.js";
import { localDateISO } from "../today-date.js";
import { nightEating, type StopBangAnswers, type NesAnswers } from "../screening.js";

const COOKWARE = [
  ["stove", "плита"], ["oven", "духовка"], ["microwave", "микроволновка"],
  ["blender", "блендер"], ["multicooker", "мультиварка"], ["airfryer", "аэрогриль"],
] as const;

const ALLERGENS = [
  ["milk", "молоко"], ["egg", "яйца"], ["fish", "рыба"],
  ["gluten", "глютен"], ["nuts", "орехи"], ["soy", "соя"],
] as const;

/**
 * Продукты, которых нет в обычном магазине за пределами больших городов.
 *
 * Повод: «я временно в командировке в России, гочжан тут не найти». Блюда с ними
 * не выбрасываются из набора — они просто уходят из меню, пока галочка стоит.
 */
export const RARE_INGREDIENTS = ["гочжан", "мисо", "харисса", "тахини", "кимчи", "сироп топинамбура"];

/**
 * Короткая форма про еду. Отдельно от онбординга сна: приложение полезно и без неё
 * (ведёт сон), а меню появляется, когда человек готов её заполнить.
 */
export function FoodSetup({ initial, onDone, onCancel }: {
  initial?: FoodSettings;
  onDone: (f: FoodSettings) => void;
  onCancel?: () => void;
}) {
  const p = initial?.profile;
  const [sex, setSex] = useState<Sex>(p?.sex ?? "m");
  const [age, setAge] = useState(p?.age ?? 30);
  const [heightCm, setHeightCm] = useState(p?.heightCm ?? 175);
  const [weightKg, setWeightKg] = useState(p?.weightKg ?? 80);
  const [goalWeightKg, setGoalWeightKg] = useState(p?.goalWeightKg ?? 75);
  const [activity, setActivity] = useState<Activity>(p?.activity ?? "low");
  const [budget, setBudget] = useState<Budget>(initial?.constraints.budget ?? "medium");
  const [mealCount, setMealCount] = useState<MealCount>(initial?.mealCount ?? 4);
  const [cookware, setCookware] = useState<string[]>(initial?.constraints.cookware ?? ["stove", "oven", "microwave"]);
  const [allergens, setAllergens] = useState<string[]>(initial?.constraints.allergens ?? []);
  const [pace, setPace] = useState<RampPace>(initial?.pace ?? DEFAULT_PACE);
  // скрининг стыка: «ворота» открывают остальные вопросы, чтобы форма не пугала длиной
  const sb = initial?.screening?.stopBang;
  const ne = initial?.screening?.nes;
  const [apneaGate, setApneaGate] = useState(!!sb?.snoringLoud);
  const [apnea, setApnea] = useState<Omit<StopBangAnswers, "snoringLoud">>({
    tiredDaytime: !!sb?.tiredDaytime, observedApnea: !!sb?.observedApnea,
    highBloodPressure: !!sb?.highBloodPressure, neckOver40cm: !!sb?.neckOver40cm,
  });
  const [nesGate, setNesGate] = useState(!!(ne?.eveningHyperphagia || ne?.nightEatingTwicePlus));
  const [nes, setNes] = useState<Omit<NesAnswers, "eveningHyperphagia" | "nightEatingTwicePlus">>({
    morningAnorexia: !!ne?.morningAnorexia, urgeToEatBeforeSleep: !!ne?.urgeToEatBeforeSleep,
    insomnia: !!ne?.insomnia, mustEatToSleep: !!ne?.mustEatToSleep,
    eveningMoodDrop: !!ne?.eveningMoodDrop, distress: !!ne?.distress,
  });
  const saved = initial?.constraints.dislikes ?? [];
  const [noRare, setNoRare] = useState(RARE_INGREDIENTS.every(r => saved.includes(r)));
  const [dislikes, setDislikes] = useState(saved.filter(d => !RARE_INGREDIENTS.includes(d)).join(", "));

  const toggle = (list: string[], set: (v: string[]) => void, key: string) =>
    set(list.includes(key) ? list.filter(x => x !== key) : [...list, key]);

  return (
    <main className="wrap">
      <p className="muted small">
        Меню собирается под твой сон: ужин встаёт за три часа до отбоя, а после плохой ночи
        день становится проще. Заполнить нужно один раз.
      </p>

      <section className="card">
        <h3 className="card-h">1 · Про тебя</h3>
        <p className="small muted">Отсюда считается норма калорий и белка.</p>
      <div className="chips">
        <button className={sex === "m" ? "chip on" : "chip"} onClick={() => setSex("m")}>Мужчина</button>
        <button className={sex === "f" ? "chip on" : "chip"} onClick={() => setSex("f")}>Женщина</button>
      </div>

      <label className="fld small">Возраст
        <input type="number" min={18} max={90} value={age} onChange={e => setAge(+e.target.value)} />
      </label>
      <label className="fld small">Рост, см
        <input type="number" min={130} max={220} value={heightCm} onChange={e => setHeightCm(+e.target.value)} />
      </label>
      <label className="fld small">Вес сейчас, кг
        <input type="number" min={35} max={250} step="0.1" value={weightKg} onChange={e => setWeightKg(+e.target.value)} />
      </label>
      <label className="fld small">Цель по весу, кг
        <input type="number" min={35} max={250} step="0.1" value={goalWeightKg} onChange={e => setGoalWeightKg(+e.target.value)} />
      </label>

      </section>

      <section className="card">
        <h3 className="card-h">2 · Образ жизни</h3>
        <p className="small muted">Насколько подвижный день — про быт, а не про спортзал.</p>
        <div className="chips">
          <button className={activity === "low" ? "chip on" : "chip"} onClick={() => setActivity("low")}>Сидячий</button>
          <button className={activity === "medium" ? "chip on" : "chip"} onClick={() => setActivity("medium")}>Средний</button>
          <button className={activity === "high" ? "chip on" : "chip"} onClick={() => setActivity("high")}>На ногах</button>
        </div>

      </section>

      {/* Число приёмов пищи — отдельный вопрос, а не часть образа жизни: раньше он стоял
          под чужим заголовком, и человек искал его в разделе про подвижность дня. */}
      <section className="card">
        <h3 className="card-h">3 · Сколько раз в день есть</h3>
        <p className="small muted">
          На вес это почти не влияет — выбирай как удобно жить. Важнее, чтобы приёмы
          были примерно в одно время.
        </p>
        <div className="seg" role="group" aria-label="Сколько раз в день есть">
          {([2, 3, 4, 5] as MealCount[]).map(n => (
            <button key={n} className={mealCount === n ? "seg-item on" : "seg-item"}
              aria-pressed={mealCount === n} onClick={() => setMealCount(n)}>
              {/* «5 раза» — не по-русски; после четырёх счётное слово меняется */}
              {n} {n < 5 ? "раза" : "раз"}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h3 className="card-h">4 · Что есть на кухне</h3>
        <p className="small muted">Рецепты подберутся под твою технику — не придётся искать замену на ходу.</p>
        <div className="chips">
          {COOKWARE.map(([key, ru]) => (
            <button key={key} className={cookware.includes(key) ? "chip on" : "chip"}
              onClick={() => toggle(cookware, setCookware, key)}>{ru}</button>
          ))}
        </div>
      </section>

      <section className="card">
        <h3 className="card-h">5 · Чего не будет в меню</h3>
        <p className="small muted">Аллергии исключаются жёстко, нелюбимое — тоже.</p>
        <div className="chips">
          {ALLERGENS.map(([key, ru]) => (
            <button key={key} className={allergens.includes(key) ? "chip on" : "chip"}
              onClick={() => toggle(allergens, setAllergens, key)}>{ru}</button>
          ))}
        </div>
        <label className="fld small">Что не любишь (через запятую)
          <input type="text" value={dislikes} placeholder="капуста, нут" onChange={e => setDislikes(e.target.value)} />
        </label>
        <div className="chips">
          <button className={noRare ? "chip on" : "chip"} onClick={() => setNoRare(!noRare)}>
            Только обычные продукты
          </button>
        </div>
        <p className="small muted">
          Уберёт блюда с редкими пастами и приправами — гочжан, мисо, харисса, тахини, кимчи.
          В большинстве магазинов их нет.
        </p>
      </section>

      <section className="card">
        <h3 className="card-h">6 · Бюджет</h3>
        <p className="small muted">
          «Небольшой» оставит блюда повыгоднее по цене за грамм белка — неделя выйдет
          примерно на тысячу рублей дешевле. Цель по калориям и белку при этом та же.
          «Средний» и «свободный» — весь набор без ограничений.
        </p>
        <div className="seg" role="group" aria-label="Бюджет">
          {([["small", "Небольшой"], ["medium", "Средний"], ["large", "Свободный"]] as const).map(([v, ru]) => (
            <button key={v} className={budget === v ? "seg-item on" : "seg-item"}
              aria-pressed={budget === v} onClick={() => setBudget(v)}>{ru}</button>
          ))}
        </div>
      </section>

      <section className="card">
        <h3 className="card-h">7 · Как входить в режим</h3>
        <p className="small muted">
          С первого дня есть на полном дефиците — самая частая причина бросить на первой неделе.
          Поэтому начинаем с того калоража, на котором ты и так живёшь, и спускаемся к цели
          понемногу. Первые дни еда будет привычнее и плотнее — паста, жаркое, запеканки.
        </p>
        <div className="seg" role="group" aria-label="Как входить в режим">
          {([["gentle", "Мягко"], ["normal", "Обычно"], ["none", "Сразу"]] as const).map(([v, ru]) => (
            <button key={v} className={pace === v ? "seg-item on" : "seg-item"}
              aria-pressed={pace === v} onClick={() => setPace(v)}>{ru}</button>
          ))}
        </div>
        <p className="small muted">
          {pace === "none"
            ? "Целевой калораж с первого дня. Подходит, если ты уже в режиме и привык к нему."
            : `${RAMP_DAYS[pace]} дней от привычного калоража до цели. Вес первые недели пойдёт медленнее — зато шанс дойти до конца заметно выше.`}
        </p>
      </section>

      {/*
        Скрининг стыка: апноэ сна и ночное питание. Оба видны только когда сон и еда
        смотрятся вместе — поодиночке ни pospat, ни oheedet их поймать не могли.

        Вопросов всего тринадцать, но подряд их никто не задаёт: сначала два «ворот».
        Ответил «нет» — секция закончилась, ответил «да» — доспросим остальное.
        Apple называет это прогрессивным раскрытием, и здесь оно уместнее всего:
        большинству эта часть формы стоит пяти секунд.
      */}
      <section className="card">
        <h3 className="card-h">8 · Короткая проверка</h3>
        <p className="small muted">
          Два вопроса про сон и еду вместе. Это не диагноз — приложение ничего не лечит
          и никуда не отправляет данные, а при тревожных ответах просто советует врача
          и не ставит жёсткий дефицит.
        </p>

        <label className="chk">
          <input type="checkbox" checked={apneaGate}
            onChange={e => setApneaGate(e.target.checked)} />
          Громко храплю или кто-то замечал остановки дыхания во сне
        </label>
        {apneaGate && (
          <div className="reveal" style={{ paddingLeft: 8 }}>
            {([
              ["tiredDaytime", "Днём разбитость даже после долгого сна"],
              ["observedApnea", "Кто-то замечал именно остановки дыхания"],
              ["highBloodPressure", "Высокое давление или лечусь от него"],
              ["neckOver40cm", "Окружность шеи больше 40 см"],
            ] as const).map(([key, ru]) => (
              <label key={key} className="chk">
                <input type="checkbox" checked={!!apnea[key]}
                  onChange={e => setApnea({ ...apnea, [key]: e.target.checked })} />
                {ru}
              </label>
            ))}
          </div>
        )}

        <label className="chk">
          <input type="checkbox" checked={nesGate}
            onChange={e => setNesGate(e.target.checked)} />
          Просыпаюсь ночью поесть или основная еда уходит на вечер
        </label>
        {nesGate && (
          <div className="reveal" style={{ paddingLeft: 8 }}>
            {([
              ["morningAnorexia", "Утром есть не хочется"],
              ["urgeToEatBeforeSleep", "Между ужином и сном тянет есть"],
              ["insomnia", "Сон рваный: трудно заснуть или просыпаюсь"],
              ["mustEatToSleep", "Кажется, что без еды не усну"],
              ["eveningMoodDrop", "К вечеру настроение хуже"],
              ["distress", "Меня это беспокоит и мешает жить"],
            ] as const).map(([key, ru]) => (
              <label key={key} className="chk">
                <input type="checkbox" checked={!!nes[key]}
                  onChange={e => setNes({ ...nes, [key]: e.target.checked })} />
                {ru}
              </label>
            ))}
          </div>
        )}
      </section>

      <div style={{ display: "flex", gap: 12, marginTop: 18, flexWrap: "wrap" }}>
        <button className="chip on" onClick={() => onDone({
          profile: { sex, age, heightCm, weightKg, goalWeightKg, activity },
          constraints: {
            allergens: allergens as never, cookware, budget, cuisines: [],
            dislikes: [
              ...dislikes.split(",").map(s => s.trim()).filter(Boolean),
              ...(noRare ? RARE_INGREDIENTS : []),
            ],
          },
          mealCount,
          pace,
          // дата старта ставится один раз: правка формы не должна начинать лестницу заново
          startISO: initial?.startISO ?? localDateISO(),
          screening: {
            stopBang: { snoringLoud: apneaGate, ...apnea },
            nes: { eveningHyperphagia: nesGate, nightEatingTwicePlus: nesGate, ...nes },
          },
          // ночное питание — красный флаг для расчёта: дефицит смягчается, а не максимальный
          screen: {
            ...(initial?.screen ?? {}),
            nesFlagged: nightEating({ eveningHyperphagia: nesGate, nightEatingTwicePlus: nesGate, ...nes }).flagged,
          },
        })}>Собрать меню</button>
        {onCancel && <button className="linkbtn" onClick={onCancel}>Не сейчас</button>}
      </div>
    </main>
  );
}
