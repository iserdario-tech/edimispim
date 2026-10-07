import React, { useState } from "react";
import type { FoodSettings } from "./storage.js";
import type { Activity, Budget, MealCount, Sex, Sweets } from "../food/types.js";
import { DEFAULT_PACE, PACES_RU, PACE_SPAN_RU, type RampPace } from "../food/rampin.js";
import { localDateISO } from "../today-date.js";
import { JunctionScreening, junctionFrom, junctionResult, type JunctionValue } from "./JunctionScreening.js";

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
 * Границы полей — те же, что стоят у самих `input`, но проверенные ПЕРЕД расчётом.
 *
 * Атрибуты `min`/`max` браузер рисует, но ввести мимо них не мешает: очищенное поле
 * даёт ноль, буква — NaN. Ноль проходил дальше молча и давал цель «0 г белка в день»
 * и калораж −544, который защита потом подпирала до 1500 — то есть меню собиралось
 * по цифрам, не имеющим отношения к человеку. NaN давал в интерфейсе «null ккал».
 */
const BOUNDS = {
  age: [18, 90], heightCm: [130, 220], weightKg: [35, 250], goalWeightKg: [35, 250],
} as const;
const RU: Record<keyof typeof BOUNDS, string> = {
  age: "возраст", heightCm: "рост", weightKg: "вес сейчас", goalWeightKg: "цель по весу",
};
/**
 * Числовое поле, которое держит текст как есть. `+""` давал 0: стёр «80» — в поле
 * остаётся 0, дописал 115 — вышло «0115». Пустое поле — NaN, его ловит checkProfile;
 * запятая с русской клавиатуры iPhone читается как точка.
 */
export function NumInput({ value, onChange, ...rest }: { value: number; onChange: (n: number) => void }
  & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const [text, setText] = useState(Number.isFinite(value) ? String(value) : "");
  return <input type="text" inputMode="decimal" {...rest} value={text} onChange={e => {
    setText(e.target.value);
    const t = e.target.value.trim().replace(",", ".");
    onChange(t === "" ? NaN : Number(t));
  }} />;
}

export function checkProfile(v: Record<keyof typeof BOUNDS, number>): string[] {
  const out = (Object.keys(BOUNDS) as (keyof typeof BOUNDS)[])
    .filter(k => !Number.isFinite(v[k]) || v[k] < BOUNDS[k][0] || v[k] > BOUNDS[k][1])
    .map(k => `${RU[k]} — от ${BOUNDS[k][0]} до ${BOUNDS[k][1]}`);
  /*
   * Цель тяжелее текущего веса форма пропускала молча. Приложение ведёт к снижению —
   * считает дефицит, темп и лестницу входа, — и на такой цели все эти цифры теряют
   * смысл, а человек об этом не узнаёт.
   */
  if (Number.isFinite(v.weightKg) && Number.isFinite(v.goalWeightKg) && v.goalWeightKg >= v.weightKg) {
    out.push("цель по весу должна быть меньше текущего: приложение ведёт к снижению");
  }
  return out;
}

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
  const [cookWeekday, setCookWeekday] = useState<number | undefined>(initial?.cookMin?.weekday);
  const [cookWeekend, setCookWeekend] = useState<number | undefined>(initial?.cookMin?.weekend);
  const [leftovers, setLeftovers] = useState(!!initial?.leftovers);
  const [sweets, setSweets] = useState<Sweets>(initial?.constraints.sweets ?? "cook");
  const [household, setHousehold] = useState(initial?.household ?? 1);
  const [strength, setStrength] = useState(!!initial?.strength);
  // скрининг стыка — общий компонент с быстрым стартом
  const [junction, setJunction] = useState<JunctionValue>(() => junctionFrom(initial?.screening));
  const saved = initial?.constraints.dislikes ?? [];
  const [noRare, setNoRare] = useState(RARE_INGREDIENTS.every(r => saved.includes(r)));
  const [dislikes, setDislikes] = useState(saved.filter(d => !RARE_INGREDIENTS.includes(d)).join(", "));

  const toggle = (list: string[], set: (v: string[]) => void, key: string) =>
    set(list.includes(key) ? list.filter(x => x !== key) : [...list, key]);

  const problems = checkProfile({ age, heightCm, weightKg, goalWeightKg });

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
        <NumInput inputMode="numeric" value={age} onChange={setAge} />
      </label>
      <label className="fld small">Рост, см
        <NumInput inputMode="numeric" value={heightCm} onChange={setHeightCm} />
      </label>
      <label className="fld small">Вес сейчас, кг
        <NumInput value={weightKg} onChange={setWeightKg} />
      </label>
      <label className="fld small">Цель по весу, кг
        <NumInput value={goalWeightKg} onChange={setGoalWeightKg} />
      </label>

      </section>

      <section className="card">
        <h3 className="card-h">2 · Сколько двигаешься</h3>
        <p className="small muted">Насколько подвижный день — про быт, а не про спортзал.</p>
        <div className="chips chips-col">
          <button className={activity === "low" ? "chip on" : "chip"} onClick={() => setActivity("low")}>Сижу почти весь день</button>
          <button className={activity === "medium" ? "chip on" : "chip"} onClick={() => setActivity("medium")}>Хожу понемногу</button>
          <button className={activity === "high" ? "chip on" : "chip"} onClick={() => setActivity("high")}>Весь день на ногах</button>
        </div>
        <label className="chk">
          <input type="checkbox" checked={strength} onChange={e => setStrength(e.target.checked)} />
          Регулярно делаю силовые — 2 раза в неделю и чаще
        </label>
        <p className="small muted">
          Белок — 1.6 г на кг каждый день. Калории за тренировки не добавляем: браслеты
          ошибаются на 27–93%, а сколько ты тратишь на самом деле, приложение поймёт по весу.
        </p>

      </section>

      {/* Число приёмов пищи — отдельный вопрос, а не часть образа жизни: раньше он стоял
          под чужим заголовком, и человек искал его в разделе про подвижность дня. */}
      <section className="card">
        <h3 className="card-h">3 · Сколько раз в день есть</h3>
        <p className="small muted">
          На вес это почти не влияет — выбирай как удобно жить. Важнее, чтобы приёмы
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
        <p className="small muted">Рецепты подберутся под твою технику — не придётся искать замену на ходу.</p>
        <div className="chips">
          {COOKWARE.map(([key, ru]) => (
            <button key={key} className={cookware.includes(key) ? "chip on" : "chip"}
              onClick={() => toggle(cookware, setCookware, key)}>{ru}</button>
          ))}
        </div>
      </section>

      {/* Готовка — отдельно от техники: будни у большинства короче выходных, и бигос
          на полтора часа в среду был гарантированным срывом плана. */}
      <section className="card">
        <h3 className="card-h">5 · Готовка</h3>
        <p className="small muted">Долгие блюда встанут на дни, когда есть время.</p>
        {([["В будни", cookWeekday, setCookWeekday], ["В выходные", cookWeekend, setCookWeekend]] as const).map(([ru, v, set]) => (
          <div key={ru} className="day-group">
            <div className="day-group-label small muted">{ru}</div>
            <div className="seg" role="group" aria-label={`Время на готовку ${ru.toLowerCase()}`}>
              {([[15, "15 мин"], [30, "30 мин"], [45, "45 мин"], [undefined, "не важно"]] as const).map(([m, label]) => (
                <button key={label} className={v === m ? "seg-item on" : "seg-item"}
                  aria-pressed={v === m} onClick={() => set(m)}>{label}</button>
              ))}
            </div>
          </div>
        ))}
        <label className="chk">
          <input type="checkbox" checked={leftovers} onChange={e => setLeftovers(e.target.checked)} />
          Готовлю ужин на два дня — обед назавтра из остатков
        </label>
        <p className="small muted">Час готовки в день превращается в час через день, и половина покупок совпадает.</p>
        <div className="day-group">
          <div className="day-group-label small muted">Готовлю на</div>
          <div className="seg" role="group" aria-label="На сколько человек готовить">
            {[1, 2, 3, 4].map(n => (
              <button key={n} className={household === n ? "seg-item on" : "seg-item"}
                aria-pressed={household === n} onClick={() => setHousehold(n)}>
                {n === 1 ? "себя" : `${n} чел.`}
              </button>
            ))}
          </div>
          <p className="small muted">Калории считаются только на тебя, продукты в списке покупок — на всех.</p>
        </div>
        {/* «готовить самому десерты — это заеб тот ещё»: сладкое можно не готовить вовсе */}
        <div className="day-group">
          <div className="day-group-label small muted">Сладкое</div>
          <div className="seg" role="group" aria-label="Сладкое">
            {([["buy", "Покупное"], ["nocook", "Без готовки"], ["cook", "Готовлю сам"]] as const).map(([v, ru]) => (
              <button key={v} className={sweets === v ? "seg-item on" : "seg-item"}
                aria-pressed={sweets === v} onClick={() => setSweets(v)}>{ru}</button>
            ))}
          </div>
          <p className="small muted">
            {sweets === "buy" ? "Шоколад с яблоком, пломбир с ягодами, батончик — купить и съесть порцию."
              : sweets === "nocook" ? "Покупное и десерты за 10 минут без плиты и духовки."
              : "Домашние десерты: запеканки, печенье, суфле — есть и долгие."}
          </p>
        </div>
      </section>

      <section className="card">
        <h3 className="card-h">6 · Чего не будет в меню</h3>
        <p className="small muted">Убираем из меню полностью — и аллергии, и то, что не любишь.</p>
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
          Уберёт блюда с редкими пастами и приправами — гочжан, мисо, харисса, тахини, кимчи.
          В большинстве магазинов их нет.
        </p>
      </section>

      <section className="card">
        <h3 className="card-h">7 · Бюджет</h3>
        <p className="small muted">
          «Небольшой» оставит блюда подешевле — неделя выйдет примерно на тысячу рублей
          дешевле, калории и белок те же. «Средний» и «не важно» — все блюда без ограничений.
        </p>
        <div className="seg" role="group" aria-label="Бюджет">
          {([["small", "Небольшой"], ["medium", "Средний"], ["large", "Не важно"]] as const).map(([v, ru]) => (
            <button key={v} className={budget === v ? "seg-item on" : "seg-item"}
              aria-pressed={budget === v} onClick={() => setBudget(v)}>{ru}</button>
          ))}
        </div>
      </section>

      <section className="card">
        <h3 className="card-h">8 · Как начать</h3>
        <p className="small muted">
          Если сразу сильно урезать еду, многие бросают в первую неделю. Поэтому начинаем
          с того, сколько ты ешь сейчас, и понемногу снижаем до цели. Первые дни еда будет
          привычнее и плотнее — паста, жаркое, запеканки.
        </p>
        <div className="seg" role="group" aria-label="Как начать">
          {PACES_RU.map(([v, ru]) => (
            <button key={v} className={pace === v ? "seg-item on" : "seg-item"}
              aria-pressed={pace === v} onClick={() => setPace(v)}>{ru}</button>
          ))}
        </div>
        <p className="small muted">
          {pace === "none"
            ? "Сразу калории для цели. Подходит, если ты уже так ешь и привык."
            : `${PACE_SPAN_RU[pace][0]!.toUpperCase() + PACE_SPAN_RU[pace].slice(1)} плавно: от того, сколько ешь сейчас, к цели. Вес вначале пойдёт медленнее — зато шанс дойти до конца заметно выше.`}
        </p>
      </section>

      {/*
        Скрининг стыка: апноэ сна и ночное питание. Оба видны только когда сон и еда
        смотрятся вместе — поодиночке ни pospat, ни oheedet их поймать не могли.

        Вопросов всего тринадцать, но подряд их никто не задаёт: сначала два «ворот».
        Ответил «нет» — секция закончилась, ответил «да» — доспросим остальное.
        Apple называет это прогрессивным раскрытием, и здесь оно уместнее всего:
        большинству эта часть формы стоит пяти секунд.
      */}
      <section className="card">
        <h3 className="card-h">9 · Короткая проверка</h3>
        <p className="small muted">
          Два вопроса про сон и еду вместе. Это не диагноз — приложение ничего не лечит,
          ответы остаются на телефоне, а если что-то отмечено, оно посоветует врача
          и не станет сильно урезать калории.
        </p>

        <JunctionScreening value={junction} onChange={setJunction} />
      </section>

      {problems.length > 0 && (
        <p className="note-warn small">
          Проверь данные о себе: {problems.join("; ")}. Пока они не заполнены, посчитать
          норму калорий и белка не из чего.
        </p>
      )}

      <div className="btn-row">
        <button className="primary" disabled={problems.length > 0} onClick={() => onDone({
          profile: { sex, age, heightCm, weightKg, goalWeightKg, activity },
          constraints: {
            allergens: allergens as never, cookware, budget, cuisines: [],
            ...(sweets !== "cook" ? { sweets } : {}),
            dislikes: [
              ...dislikes.split(",").map(s => s.trim()).filter(Boolean),
              ...(noRare ? RARE_INGREDIENTS : []),
            ],
          },
          mealCount,
          pace,
          ...(cookWeekday !== undefined || cookWeekend !== undefined
            ? { cookMin: { ...(cookWeekday !== undefined ? { weekday: cookWeekday } : {}), ...(cookWeekend !== undefined ? { weekend: cookWeekend } : {}) } }
            : {}),
          ...(leftovers ? { leftovers: true } : {}),
          ...(household > 1 ? { household } : {}),
          ...(strength ? { strength: true } : {}),
          // полные настройки открыты — карточка «донастрой» больше не нужна
          tuned: true,
          ...(initial?.kcalAdjust ? { kcalAdjust: initial.kcalAdjust } : {}),
          ...(initial?.kcalAdjustAt ? { kcalAdjustAt: initial.kcalAdjustAt } : {}),
          // дата старта ставится один раз: правка формы не должна начинать лестницу заново
          startISO: initial?.startISO ?? localDateISO(),
          screening: junctionResult(junction).screening,
          // ночное питание — красный флаг для расчёта: дефицит смягчается, а не максимальный
          screen: { ...(initial?.screen ?? {}), nesFlagged: junctionResult(junction).nesFlagged },
        })}>Собрать меню</button>
        {onCancel && <button className="linkbtn" onClick={onCancel}>Не сейчас</button>}
      </div>
    </main>
  );
}
