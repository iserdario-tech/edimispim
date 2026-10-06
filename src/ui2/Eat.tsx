import { useMemo, useState } from "react";
import type { Meal, Recipe } from "../food/types.js";
import { swapOptions, swapTo, swapDish, diagnosePool } from "../food/index.js";
import { planPurchase } from "../food/packaging.js";
import recipesJson from "../food/data/recipes.json";
import { photoFor, photoUrl } from "../food/photos.js";
import { fmtHM } from "../time.js";
import { Sheet } from "../ui/Sheet.js";
import { MealIngredients } from "../ui/Grocery.js";
import { Catalog } from "../ui/Catalog.js";
import { poolForDate } from "../ui/dayOpts.js";
import { tap } from "../ui/haptics.js";
import type { AppModel } from "./Shell.js";
import type { WeekModel } from "./useWeek.js";

const RECIPES = recipesJson as Recipe[];
const DOW = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

/**
 * «Еда» 2.0: сегодня и завтра крупно, неделя — лентой дней, покупки — отдельным режимом.
 *
 * Раньше это была неделя аккордеоном, холодильник, покупки и каталог одной простынёй:
 * 907 слов и 7.6 экрана. Теперь на экране один день — четыре карточки, — а всё остальное
 * открывается по тапу: рецепт и замена шторкой, каталог поиском, покупки отдельным экраном.
 */
export function Eat({ app, week, onShop, onSetupFood }: { app: AppModel; week: WeekModel; onShop: () => void; onSetupFood: () => void }) {
  const state = app.state!;
  const a = app.actions;
  const [idx, setIdx] = useState(0);
  const [recipe, setRecipe] = useState<Meal | null>(null);
  const [swapping, setSwapping] = useState<number | null>(null);
  const [search, setSearch] = useState(false);
  const plan = week.plan;
  const toBuy = useMemo(() => plan ? planPurchase(plan.grocery.items, week.pantry).filter(l => !l.staple && l.toBuy > 0) : [], [plan, week.pantry]);

  if (!plan || !state.food) {
    return (
      <main className="s-screen">
        <h1 className="s-title">Еда</h1>
        <section className="s-card">
          <h2 className="s-h2">Меню под твой сон</h2>
          <p className="s-muted">Ужин за три часа до отбоя, после плохой ночи — проще. Заполнить один раз.</p>
          <button className="s-btn food" onClick={onSetupFood}>Настроить меню</button>
        </section>
      </main>
    );
  }

  const d = plan.days[idx]!;
  const diagnosis = diagnosePool(plan.pool, state.food.mealCount).messageRU;
  const marks = idx === 0 ? state.eaten?.[week.today]?.marks ?? {} : {};
  const swapPool = poolForDate(plan.pool, state.food, d.date, state.noCookDays);
  const choose = (k: number, r: Recipe) => {
    tap();
    const slot = d.day.meals[k]!.slot;
    swapTo(d.day, k, r, d.targets, state.food!.mealCount);
    a.saveSwap(d.date, slot, r.id);
    setSwapping(null);
    week.bump();
  };

  return (
    <main className="s-screen">
      <div className="s-head s-head-between">
        <h1 className="s-title">Еда</h1>
        <button className="s-i s-search" aria-label="Все блюда" onClick={() => setSearch(true)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21" />
          </svg>
        </button>
      </div>

      <div className="s-seg" role="group" aria-label="День">
        {([[0, "Сегодня"], [1, "Завтра"]] as const).map(([i, ru]) => (
          <button key={i} className={idx === i ? "on" : ""} aria-pressed={idx === i} onClick={() => { tap(); setIdx(i); }}>{ru}</button>
        ))}
      </div>
      <div className="s-week" role="group" aria-label="Неделя">
        {plan.days.map((x, i) => {
          const dt = new Date(x.date + "T12:00:00");
          return (
            <button key={x.date} className={idx === i ? "on" : ""} aria-pressed={idx === i} onClick={() => { tap(); setIdx(i); }}>
              <span>{DOW[dt.getDay()]}</span><b>{dt.getDate()}</b>
            </button>
          );
        })}
      </div>
      <p className="s-small s-day-total">{d.day.totals.kcal} ккал · белок {d.day.totals.protein} г</p>
      {diagnosis && <p className="s-small s-day-total">{diagnosis}</p>}

      {/* после быстрого старта меню по умолчанию — зовём донастроить, но не заставляем */}
      {state.food.tuned === false && (
        <section className="s-card">
          <h2 className="s-h2">Донастрой меню · 1 минута</h2>
          <p className="s-muted">Что не ешь, какая техника есть, бюджет и время на готовку — и меню станет твоим.</p>
          <div className="s-yn-btns">
            <button className="s-btn food" onClick={onSetupFood}>Настроить</button>
            <button className="s-btn ghost" onClick={() => { tap(); a.markTuned(); }}>Не нужно</button>
          </div>
        </section>
      )}

      <div className="s-meals">
        {d.day.meals.map((m, k) => {
          const done = marks[m.slot] === "ate";
          return (
            <div key={m.slot} className="s-card s-meal">
              <button className="s-meal-main" onClick={() => setRecipe(m)}>
                <span className="s-plate"><img src={photoUrl(photoFor(m.recipe))} alt="" loading="lazy" decoding="async" /></span>
                <span className="s-what">
                  <b>{m.recipe.name}</b>
                  <span>{fmtHM(m.timeMin)} · {Math.round(m.recipe.kcal * m.servings)} ккал{m.leftover ? " · остатки ужина" : m.recipe.time_min ? ` · ${m.recipe.time_min} мин` : ""}</span>
                </span>
              </button>
              {done
                ? <span className="s-meal-done" aria-label="съедено">✓</span>
                : <button className="s-meal-swap" aria-label={`Заменить: ${m.recipe.name}`} onClick={() => { tap(); setSwapping(k); }}>↻</button>}
            </div>
          );
        })}
      </div>

      <button className="s-shop" onClick={() => { tap(); onShop(); }}>
        <span><b>В магазине</b><span>{toBuy.length ? `${toBuy.length} продуктов на неделю · ≈${plan.grocery.estCostRub.toLocaleString("ru-RU")} ₽` : "всё есть дома"}</span></span>
        <span aria-hidden="true">→</span>
      </button>

      {recipe && (
        <Sheet title={recipe.recipe.name} onClose={() => setRecipe(null)}>
          <MealIngredients meal={recipe} household={state.food.household ?? 1} rating={state.ratings?.[recipe.recipe.id]} onRate={a.rateDish} />
        </Sheet>
      )}
      {swapping !== null && d.day.meals[swapping] && (
        <Sheet title="Чем заменить" onClose={() => setSwapping(null)}>
          <div className="s-options">
            {swapOptions(d.day, swapping, d.targets, swapPool, state.food.mealCount, week.pantry).map(r => (
              <button key={r.id} className="s-option" onClick={() => choose(swapping, r)}>
                <span className="s-plate"><img src={photoUrl(photoFor(r))} alt="" loading="lazy" /></span>
                <span className="s-what"><b>{r.name}</b><span>{Math.round(r.kcal)} ккал{r.time_min ? ` · ${r.time_min} мин` : ""}</span></span>
              </button>
            ))}
          </div>
          <button className="s-btn ghost" onClick={() => {
            const slot = d.day.meals[swapping]!.slot;
            if (swapDish(d.day, swapping, d.targets, swapPool, state.food!.mealCount, week.pantry)) {
              const now = d.day.meals.find(m => m.slot === slot);
              if (now) a.saveSwap(d.date, slot, now.recipe.id);
              week.bump();
            }
            setSwapping(null);
          }}>Любое другое</button>
        </Sheet>
      )}
      {search && (
        <Sheet title="Все блюда" onClose={() => setSearch(false)}>
          <Catalog recipes={RECIPES} ratings={state.ratings} onRate={a.rateDish} />
        </Sheet>
      )}
    </main>
  );
}
