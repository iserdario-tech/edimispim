import { useState } from "react";
import { Sheet } from "../ui/Sheet.js";
import { EatSheet } from "../ui/EatSheet.js";
import { tap } from "../ui/haptics.js";
import type { Slot } from "../food/types.js";
import type { DayModel } from "./useDay.js";
import type { AppModel } from "./Shell.js";

const SLOT_RU: Record<string, string> = { breakfast: "завтрак", lunch: "обед", dinner: "ужин", dessert: "сладкое", snack: "перекус" };

/**
 * «+» — все действия дня в одном месте: съел следующий приём, написал, что съел,
 * взвесился, отметил ночь. Действие — отдельная кнопка, а не вкладка (HIG).
 */
export function PlusSheet({ app, day, onClose, initial = null }: { app: AppModel; day: DayModel; onClose: () => void; initial?: null | "night" }) {
  const a = app.actions;
  const [mode, setMode] = useState<null | "write" | "weight" | "night">(initial);
  const [kg, setKg] = useState("");
  const [woke, setWoke] = useState(day.wokeHM);
  const [bed, setBed] = useState(day.bedHM ?? "");
  const [q, setQ] = useState<1 | 2 | 3 | 4 | 5>(day.quality as 1 | 2 | 3 | 4 | 5);
  const meals = day.balanced?.day.meals ?? [];
  const nextMeal = meals.find(m => !day.eaten?.marks[m.slot] && m.timeMin >= day.nowMin - 90)
    ?? meals.find(m => !day.eaten?.marks[m.slot]);
  const lastKg = app.state!.weights?.at(-1);
  const planned = day.foodDay?.day.meals.length ?? 0;

  if (mode === "write") {
    return <EatSheet title="Что ты съел?" onClose={onClose}
      onSave={food => a.extraAdd(day.today, food, planned)} />;
  }

  return (
    <Sheet title={mode === "weight" ? "Вес" : mode === "night" ? "Ночь" : "Добавить"} onClose={onClose}>
      {mode === null && (
        <div className="s-tiles">
          {nextMeal && (
            <button className="s-tile food" onClick={() => {
              tap();
              const slot: Slot = nextMeal.slot;
              const plan = day.foodDay?.day.meals.find(m => m.slot === slot)?.servings ?? 1;
              a.markMeal(day.today, slot, "ate", planned, day.foodDay?.day.totals.kcal, Math.round((nextMeal.servings / plan) * 100) / 100);
              onClose();
            }}>
              <span className="s-tile-ico">✓</span>
              <b>Съел {SLOT_RU[nextMeal.slot]}</b>
              <span>{nextMeal.recipe.name}</span>
            </button>
          )}
          <button className="s-tile sleep" onClick={() => setMode("write")}>
            <span className="s-tile-ico">✎</span><b>Съел своё</b><span>напиши словами — посчитаю калории</span>
          </button>
          <button className="s-tile ok" onClick={() => setMode("weight")}>
            <span className="s-tile-ico">⚖</span><b>Вес</b><span>{lastKg ? `последний — ${lastKg.kg} кг` : "ещё не записывал"}</span>
          </button>
          <button className="s-tile sleep" onClick={() => setMode("night")}>
            <span className="s-tile-ico">☾</span><b>Ночь</b><span>как спал и во сколько лёг</span>
          </button>
        </div>
      )}
      {mode === "weight" && (
        <form className="s-form" onSubmit={e => { e.preventDefault(); const v = +kg.replace(",", "."); if (v >= 30 && v <= 300) { tap(); a.addWeight(v); onClose(); } }}>
          <label className="s-field">Вес сейчас, кг
            <input type="text" inputMode="decimal" value={kg} placeholder={lastKg ? String(lastKg.kg) : "80.0"} autoFocus onChange={e => setKg(e.target.value)} />
          </label>
          <p className="s-small">Утром, до еды. Одна цифра прыгает на полкило из‑за воды — смотри на линию в «Я».</p>
          <button className="s-btn food" type="submit" disabled={!kg}>Записать</button>
        </form>
      )}
      {mode === "night" && (
        <form className="s-form" onSubmit={e => { e.preventDefault(); tap(); a.saveLog({ date: day.today, wokeHM: woke, quality: q, ...(bed ? { bedHM: bed } : {}) }); onClose(); }}>
          <label className="s-field">Встал<input type="time" value={woke} onChange={e => setWoke(e.target.value)} /></label>
          <label className="s-field">Лёг вчера (если помнишь)<input type="time" value={bed} onChange={e => setBed(e.target.value)} /></label>
          <div className="s-chips">
            {([1, 2, 3, 4, 5] as const).map(v => (
              <button type="button" key={v} className={q === v ? "s-pill on" : "s-pill"} onClick={() => setQ(v)}>
                {["", "плохо", "так себе", "норм", "хорошо", "отлично"][v]}
              </button>
            ))}
          </div>
          <button className="s-btn food" type="submit">Записать ночь</button>
        </form>
      )}
    </Sheet>
  );
}
