import React, { useMemo, useState } from "react";
import type { Grocery, Meal } from "../food/types.js";
import { SHOPS, DEFAULT_SHOP_ID, shopById, searchUrl, opensInNewTab } from "../food/shops.js";
import { planPurchase, type BuyLine, type Pantry } from "../food/packaging.js";
import { loadFavorites, saveFavorite, removeFavorite, favKey, extractProductUrl, type Favorites } from "../food/favorites.js";
import { hintFor } from "../food/ingredients.js";

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

/** На телефоне — в том же окне, иначе установленное приложение магазина не перехватит ссылку. */
const linkTarget = (): { target?: string; rel?: string } =>
  typeof window !== "undefined" && opensInNewTab(window.innerWidth)
    ? { target: "_blank", rel: "noopener noreferrer" }
    : {};

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

/** Ссылка: сохранённая карточка товара, если есть, иначе поиск по названию. */
function itemLink(name: string, shopId: string, favs: Favorites): { href: string; exact: boolean } {
  const fav = favs[favKey(name, shopId)];
  return fav ? { href: fav.url, exact: true } : { href: searchUrl(shopById(shopId), name), exact: false };
}

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
  const [favs, setFavs] = useState<Favorites>(loadFavorites);
  const [scope, setScope] = useState<"week" | number>("week");

  const shop = shopById(shopId);
  const day = typeof scope === "number" ? grocery.byDay[scope] : null;
  const rawItems = day ? day.items : grocery.items;
  const title = day ? `Покупки на день ${day.day}` : "Покупки на неделю";

  const lines = useMemo(() => planPurchase(rawItems, pantry), [rawItems, pantry]);
  const active = lines.filter(l => !l.staple && l.toBuy > 0);
  const done = lines.filter(l => !l.staple && l.toBuy === 0);
  const cost = day ? day.estCostRub : grocery.estCostRub;

  const chooseShop = (id: string) => { setShopId(id); writeLS(SHOP_KEY, id); };

  /** Галочка: продукт взят или уже есть — кладём в кладовку вместе с остатком упаковки. */
  const toggle = (line: BuyLine, checked: boolean) => {
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

  /** Запомнить конкретную карточку товара — чтобы не выбирать из двадцати видов заново. */
  const remember = (name: string) => {
    const current = favs[favKey(name, shopId)];
    const pasted = prompt(
      `«${name}» в «${shop.name}»\n\nОткрой нужный товар в приложении магазина, нажми «Поделиться» и вставь ссылку сюда.\nДальше приложение будет открывать сразу его.\n\nПустое поле — забыть товар.`,
      current?.url ?? "",
    );
    if (pasted === null) return;
    if (!pasted.trim()) { setFavs(removeFavorite(favs, name, shopId)); return; }
    const url = extractProductUrl(pasted);
    if (!url) { alert("Не нашёл ссылку в тексте"); return; }
    setFavs(saveFavorite(favs, name, shopId, { url }));
  };

  const row = (line: BuyLine, checked: boolean) => {
    const { href, exact } = itemLink(line.name, shopId, favs);
    const hint = hintFor(line.name);   // «творог мягкий» без пояснения у прилавка бесполезен
    const amount = line.packs > 0 ? `${line.packs} × ${line.packSize} ${line.unit}` : `${line.toBuy} ${line.unit}`;
    return (
      <li key={line.name + line.unit} className={checked ? "buy-row done" : "buy-row"}>
        <label className="buy-check">
          <input type="checkbox" checked={checked} onChange={e => toggle(line, e.target.checked)} />
          <span className="sr-only">Взял {line.name}</span>
        </label>

        <span className="buy-title">
          <a className="buy-name" href={href} {...linkTarget()}>{line.name}</a>
          {hint && <span className="buy-hint small muted">{hint.what}</span>}
        </span>

        <span className="small muted buy-qty">
          {checked ? "есть" : amount}
          {!checked && showsLeftover(line) && (
            <span className="left-note"> · останется {line.leftover} {line.unit}</span>
          )}
        </span>

        <button className={exact ? "pick on" : "pick"} onClick={() => remember(line.name)}
          title={exact ? "Открывается твой товар — нажми, чтобы сменить или забыть"
                       : "Привязать конкретный товар из магазина, чтобы не выбирать заново"}>
          {exact ? "мой ✓" : "выбрать"}
        </button>
      </li>
    );
  };

  return (
    <section className="card">
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

      <ul className="buy-list">
        {active.map(l => row(l, false))}
        {done.map(l => row(l, true))}
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
        «Выбрать» — привязать конкретный товар из магазина: скопируй ссылку на него, и дальше
        приложение будет открывать сразу его, а не список из двадцати видов помидоров.
        У привязанных стоит «мой&nbsp;✓».
      </p>
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
  const favs = loadFavorites();
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
              const { href, exact } = itemLink(i.name, shopId, favs);
              return (
                <li key={k}>
                  <a className="shop-link" href={href} target="_blank" rel="noopener noreferrer">
                    {i.name}<span className="shop-go" aria-hidden="true">{exact ? "✓" : "→"}</span>
                  </a>
                  <span className="small muted">{i.qty} {i.unit}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}

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
