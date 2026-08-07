import React, { useState } from "react";
import type { FoodSettings } from "./storage.js";
import type { Activity, Budget, MealCount, Sex } from "../food/types.js";

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

        <p className="small muted" style={{ marginTop: 14 }}>
          Сколько раз в день есть. На вес это почти не влияет — выбирай как удобно жить.
          Важнее, чтобы приёмы были примерно в одно время.
        </p>
        <div className="chips">
          {([2, 3, 4, 5] as MealCount[]).map(n => (
            <button key={n} className={mealCount === n ? "chip on" : "chip"} onClick={() => setMealCount(n)}>
              {n} раза
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h3 className="card-h">3 · Что есть на кухне</h3>
        <p className="small muted">Рецепты подберутся под твою технику — не придётся искать замену на ходу.</p>
        <div className="chips">
          {COOKWARE.map(([key, ru]) => (
            <button key={key} className={cookware.includes(key) ? "chip on" : "chip"}
              onClick={() => toggle(cookware, setCookware, key)}>{ru}</button>
          ))}
        </div>
      </section>

      <section className="card">
        <h3 className="card-h">4 · Чего не будет в меню</h3>
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
        <h3 className="card-h">5 · Бюджет</h3>
        <p className="small muted">
          «Небольшой» оставит блюда повыгоднее по цене за грамм белка — неделя выйдет
          примерно на тысячу рублей дешевле. Цель по калориям и белку при этом та же.
          «Средний» и «свободный» — весь набор без ограничений.
        </p>
        <div className="chips">
          <button className={budget === "small" ? "chip on" : "chip"} onClick={() => setBudget("small")}>Небольшой</button>
          <button className={budget === "medium" ? "chip on" : "chip"} onClick={() => setBudget("medium")}>Средний</button>
          <button className={budget === "large" ? "chip on" : "chip"} onClick={() => setBudget("large")}>Свободный</button>
        </div>
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
        })}>Собрать меню</button>
        {onCancel && <button className="linkbtn" onClick={onCancel}>Не сейчас</button>}
      </div>
    </main>
  );
}
