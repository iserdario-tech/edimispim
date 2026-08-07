import React, { useMemo, useState } from "react";
import type { Grocery, Meal } from "../food/types.js";
import { SHOPS, DEFAULT_SHOP_ID, shopById, searchUrl } from "../food/shops.js";
import { planPurchase, type BuyLine, type Pantry } from "../food/packaging.js";
import { PRICES_SOURCE, PRICES_DATE, costOf } from "../food/prices.js";
import { hintFor } from "../food/ingredients.js";
import { tap } from "./haptics.js";

const SHOP_KEY = "edimispim.shop";
const PANTRY_KEY = "edimispim.pantry";

const readLS = <T,>(key: string, fallback: T): T => {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; }
  catch { return fallback; }
};
const writeLS = (key: string, v: unknown): void => {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* приватный режим */ }
};

const pantryKey = (name: string, unit: string): string => `${name.toLowerCase().trim()}|${unit}`;

/** Всегда новой вкладкой: список покупок не должен исчезать из-под рук. */
const linkTarget = { target: "_blank", rel: "noopener noreferrer" } as const;

/**
 * Показывать ли остаток.
 *
 * «Мёд · останется 201.8 г» — правда, но бесполезная: мёд стоит в шкафу месяцами,
 * и напоминание о нём только зашумляет список. Остаток важен для скоропорта —
 * там это предупреждение «успей съесть» — и когда его заметно много.
 */
const showsLeftover = (line: BuyLine): boolean =>
  line.leftover > 0 &&
  line.perishDays !== undefined && line.perishDays <= 14 &&
  line.leftover >= line.need * 0.25;

/** Ссылка на поиск товара в выбранном сервисе. */
const itemLink = (name: string, shopId: string): string => searchUrl(shopById(shopId), name);

/**
 * Покупки — список с галочками.
 *
 * Так было не сразу: сначала на каждой строке висели четыре кнопки — «запомнить»,
 * «есть дома», плюс общие «отправить список» и «закупился». Каждая по отдельности
 * имела смысл, а вместе получалась каша, в которой непонятно, что вообще нажимать.
 *
 * Теперь одна механика, привычная по любому списку покупок: галочка = «взял или уже есть».
 * Отмеченное вычёркивается и само уходит в кладовку — остаток от упаковки учтётся
 * в следующей закупке, отдельной кнопки «закупился» для этого не нужно.
 */
export function GroceryBlock({ grocery }: { grocery: Grocery }) {
  const [shopId, setShopId] = useState(() => readLS(SHOP_KEY, DEFAULT_SHOP_ID));
  const [pantry, setPantry] = useState<Pantry>(() => readLS<Pantry>(PANTRY_KEY, {}));
  const [scope, setScope] = useState<"week" | number>("week");

  const shop = shopById(shopId);
  const day = typeof scope === "number" ? grocery.byDay[scope] : null;
  const rawItems = day ? day.items : grocery.items;
  const title = day ? `Покупки на день ${day.day}` : "Покупки на неделю";

  const lines = useMemo(() => planPurchase(rawItems, pantry), [rawItems, pantry]);
  const active = lines.filter(l => !l.staple && l.toBuy > 0);
  const done = lines.filter(l => !l.staple && l.toBuy === 0);
  const cost = day ? day.estCostRub : grocery.estCostRub;
  // сумма молча пропускала продукты без цены — «≈6954 ₽» читалось как полная стоимость недели
  const unpriced = useMemo(
    () => lines.filter(l => !l.staple && l.toBuy > 0 && costOf(l.name, l.toBuy, l.unit) === null),
    [lines],
  );

  const chooseShop = (id: string) => { setShopId(id); writeLS(SHOP_KEY, id); };

  /** Галочка: продукт взят или уже есть — кладём в кладовку вместе с остатком упаковки. */
  const toggle = (line: BuyLine, checked: boolean) => {
    tap();
    const key = pantryKey(line.name, line.unit);
    const next = { ...pantry };
    if (checked) next[key] = line.need + line.leftover;   // купленное минус съеденное = остаток
    else delete next[key];
    setPantry(next); writeLS(PANTRY_KEY, next);
  };

  const clearAll = () => { setPantry({}); writeLS(PANTRY_KEY, {}); };
  const checkAll = () => {
    const next = { ...pantry };
    for (const l of active) next[pantryKey(l.name, l.unit)] = l.need + l.leftover;
    setPantry(next); writeLS(PANTRY_KEY, next);
  };

  const row = (line: BuyLine, checked: boolean) => {
    const href = itemLink(line.name, shopId);
    const hint = hintFor(line.name);   // «творог мягкий» без пояснения у прилавка бесполезен
    const amount = line.packs > 0 ? `${line.packs} × ${line.packSize} ${line.unit}` : `${line.toBuy} ${line.unit}`;
    return (
      <li key={line.name + line.unit} className={checked ? "buy-row done" : "buy-row"}>
        <label className="buy-check">
          <input type="checkbox" checked={checked} onChange={e => toggle(line, e.target.checked)} />
          <span className="sr-only">Взял {line.name}</span>
        </label>

        <span className="buy-title">
          <a className="buy-name" href={href} {...linkTarget}>{line.name}</a>
          {hint && <span className="buy-hint small muted">{hint.what}</span>}
        </span>

        <span className="small muted buy-qty">
          {checked ? "есть" : amount}
          {!checked && showsLeftover(line) && (
            <span className="left-note"> · останется {line.leftover} {line.unit}</span>
          )}
        </span>
      </li>
    );
  };

  return (
    <section className="card wide">
      <h3 className="card-h">{title} · ≈{cost} ₽</h3>

      <div className="chips">
        {SHOPS.map(s => (
          <button key={s.id} className={s.id === shopId ? "chip on" : "chip"}
            onClick={() => chooseShop(s.id)}>{s.name}</button>
        ))}
      </div>

      <div className="chips" style={{ marginTop: 8 }}>
        <button className={scope === "week" ? "chip on" : "chip"} onClick={() => setScope("week")}>Вся неделя</button>
        {grocery.byDay.map((d, i) => (
          <button key={d.day} className={scope === i ? "chip on" : "chip"} onClick={() => setScope(i)}>
            День {d.day}
          </button>
        ))}
      </div>

      <p className="small muted" style={{ marginTop: 12 }}>
        Отмечай галочкой, что взял. Тап по названию открывает товар в «{shop.name}».
      </p>

      {/* Строка остаётся на своём месте: раньше отмеченное сразу улетало вниз,
          и список прыгал под пальцем — легко потерять, где ты был. Отмеченное
          вычёркивается, но не двигается. */}
      <ul className="buy-list">
        {lines.filter(l => !l.staple).map(l => row(l, l.toBuy === 0))}
      </ul>

      <div className="buy-foot small muted">
        <span>Взято {done.length} из {active.length + done.length}</span>
        {active.length > 0 && <button className="linkbtn small" onClick={checkAll}>отметить всё</button>}
        {done.length > 0 && <button className="linkbtn small" onClick={clearAll}>снять отметки</button>}
      </div>

      <p className="small muted">
        Количества приведены к реальным упаковкам, а остаток запоминается: если нужно 100 г
        творога, а пачка 200 — в следующий раз приложение не попросит покупать творог снова.
      </p>
      <p className="small muted">
        Цены сняты в «{PRICES_SOURCE}» {PRICES_DATE.split("-").reverse().join(".")}: из выдачи
        берётся недорогой обычный вариант, а не премиальный. В другом городе и магазине
        будут другие, и со временем они устаревают.
      </p>
      {unpriced.length > 0 && (
        <p className="small muted">
          В сумму не вошли позиции, по которым честной цены нет ({unpriced.length}):{" "}
          {unpriced.map(l => l.name).join(", ")}. Значит, на деле выйдет дороже.
        </p>
      )}
    </section>
  );
}

/**
 * Карточка блюда: состав и КАК ГОТОВИТЬ.
 *
 * Шаги были в oheedet и потерялись при переносе — без них меню бесполезно:
 * человек видит «Гочжан-свинина с кимчи», а что с ней делать, не написано.
 * Количества в составе умножены на размер порции, шаги — как в рецепте.
 */
export function MealIngredients({ meal }: { meal: Meal }) {
  const shopId = readLS(SHOP_KEY, DEFAULT_SHOP_ID);
  const shop = shopById(shopId);
  const ings = (meal.recipe.ingredients ?? []).map(i => ({
    name: i.name, qty: +(i.qty * meal.servings).toFixed(1), unit: i.unit,
  }));

  const steps = meal.recipe.steps ?? [];
  if (!ings.length && !steps.length) return <div className="meal-ings small muted">Рецепт не указан.</div>;

  return (
    <div className="meal-ings">
      {ings.length > 0 && (
        <>
          <div className="small muted">Продукты на эту порцию · «{shop.name}»</div>
          <ul>
            {ings.map((i, k) => {
              const href = itemLink(i.name, shopId);
              return (
                <li key={k}>
                  <a className="shop-link" href={href} target="_blank" rel="noopener noreferrer">
                    {i.name}<span className="shop-go" aria-hidden="true">→</span>
                  </a>
                  <span className="small muted">{i.qty} {i.unit}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* про происхождение говорим всегда: тишина у «домашних» рецептов читалась как
          «этот тоже откуда-то взят», а половина набора написана для приложения */}
      <p className="small muted" style={{ marginTop: 10 }}>
        {meal.recipe.source ? (
          <>
            Рецепт с <a href={meal.recipe.source} target="_blank" rel="noopener noreferrer">источника</a> —
            состав оттуда, калории пересчитаны приложением по справочнику продуктов.
          </>
        ) : (
          <>Рецепт составлен для приложения; калории посчитаны по справочнику продуктов.</>
        )}
      </p>

      {steps.length > 0 && (
        <>
          <div className="small muted" style={{ marginTop: 12 }}>
            Как готовить{meal.recipe.time_min ? ` · ${meal.recipe.time_min} мин` : ""}
          </div>
          <ol className="recipe-steps small">
            {steps.map((st, k) => <li key={k}>{st}</li>)}
          </ol>
        </>
      )}
    </div>
  );
}
