import React, { useMemo, useState } from "react";
import type { Grocery, Meal } from "../food/types.js";
import { SHOPS, DEFAULT_SHOP_ID, shopById, searchUrl, listAsText } from "../food/shops.js";
import { planPurchase, pantryAfter, type BuyLine, type Pantry } from "../food/packaging.js";
import {
  loadFavorites, saveFavorite, removeFavorite, favKey, extractProductUrl, type Favorites,
} from "../food/favorites.js";

const SHOP_KEY = "edimispim.shop";
const PANTRY_KEY = "edimispim.pantry";

const readLS = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
};
const writeLS = (key: string, v: unknown): void => {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* приватный режим */ }
};

/** Ссылка на товар: сохранённая карточка, если она есть, иначе поиск по названию. */
function itemLink(name: string, shopId: string, favs: Favorites): { href: string; exact: boolean } {
  const fav = favs[favKey(name, shopId)];
  return fav ? { href: fav.url, exact: true } : { href: searchUrl(shopById(shopId), name), exact: false };
}

/** Строка продукта: сколько брать с учётом фасовки и что останется. */
function LineRow({ line, shopId, favs, onFav, onHave }: {
  line: BuyLine;
  shopId: string;
  favs: Favorites;
  onFav: (name: string) => void;
  onHave: (line: BuyLine) => void;
}) {
  const { href, exact } = itemLink(line.name, shopId, favs);
  const amount = line.packs > 0
    ? `${line.packs} × ${line.packSize} ${line.unit}`
    : `${line.toBuy} ${line.unit}`;

  return (
    <li className={line.toBuy === 0 ? "buy-line have" : "buy-line"}>
      <a className="shop-link" href={href} target="_blank" rel="noopener noreferrer">
        {line.name}
        <span className="shop-go" aria-hidden="true">{exact ? "★" : "→"}</span>
      </a>

      <span className="small muted buy-amount">
        {line.toBuy === 0 ? "есть дома" : amount}
        {line.leftover > 0 && line.toBuy > 0 && (
          <span className="left-note"> · останется {line.leftover} {line.unit}</span>
        )}
      </span>

      <span className="buy-actions">
        {/* Запомненный товар не запирает: поиск рядом, если сегодня хочется другого */}
        {exact && (
          <a className="linkbtn small" href={searchUrl(shopById(shopId), line.name)}
            target="_blank" rel="noopener noreferrer">искать другое</a>
        )}
        <button className="linkbtn small"
          title={exact ? "Заменить или забыть запомненный товар" : "Запомнить конкретный товар"}
          onClick={() => onFav(line.name)}>{exact ? "сменить" : "запомнить"}</button>
        {line.toBuy > 0 && (
          <button className="linkbtn small" title="Уже есть дома"
            onClick={() => onHave(line)}>есть дома</button>
        )}
      </span>
    </li>
  );
}

export function GroceryBlock({ grocery }: { grocery: Grocery }) {
  const [shopId, setShopId] = useState(() => readLS(SHOP_KEY, DEFAULT_SHOP_ID));
  const [pantry, setPantry] = useState<Pantry>(() => readLS<Pantry>(PANTRY_KEY, {}));
  const [favs, setFavs] = useState<Favorites>(loadFavorites);
  const [scope, setScope] = useState<"week" | number>("week");
  const [msg, setMsg] = useState("");

  const shop = shopById(shopId);
  const day = typeof scope === "number" ? grocery.byDay[scope] : null;
  const rawItems = day ? day.items : grocery.items;
  const title = day ? `Покупки на день ${day.day}` : "Покупки на неделю";

  // Главное отличие от простого списка: количества приведены к реальным упаковкам,
  // а то, что уже лежит дома, из закупки вычтено.
  const lines = useMemo(() => planPurchase(rawItems, pantry), [rawItems, pantry]);
  const toBuyLines = lines.filter(l => l.toBuy > 0 && !l.staple);
  const haveLines = lines.filter(l => l.toBuy === 0 && !l.staple);

  const chooseShop = (id: string) => { setShopId(id); writeLS(SHOP_KEY, id); };

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(""), 3000); };

  /** Запомнить конкретную карточку товара: ссылку человек копирует из приложения магазина. */
  const rememberProduct = (name: string) => {
    const current = favs[favKey(name, shopId)];
    const pasted = prompt(
      `«${name}» в «${shop.name}»\n\nОткрой товар в приложении, нажми «Поделиться» и вставь ссылку сюда.\nПустое поле — забыть товар.`,
      current?.url ?? "",
    );
    if (pasted === null) return;
    if (!pasted.trim()) {
      setFavs(removeFavorite(favs, name, shopId));
      flash("Товар забыт — снова будет поиск");
      return;
    }
    const url = extractProductUrl(pasted);
    if (!url) { flash("Не нашёл ссылку в тексте"); return; }
    setFavs(saveFavorite(favs, name, shopId, { url }));
    flash("Запомнил — теперь сразу этот товар");
  };

  /** Отметить, что продукт уже есть дома: тогда он выпадет из закупки. */
  const markHave = (line: BuyLine) => {
    const answer = prompt(`Сколько «${line.name}» уже есть дома, ${line.unit}?`, String(line.need));
    if (answer === null) return;
    const qty = Number(answer.replace(",", "."));
    if (!Number.isFinite(qty) || qty < 0) { flash("Не понял количество"); return; }
    const next: Pantry = { ...pantry, [`${line.name.toLowerCase().trim()}|${line.unit}`]: qty };
    setPantry(next); writeLS(PANTRY_KEY, next);
  };

  /** После закупки остатки переезжают в кладовку — чтобы не покупать то же самое снова. */
  const saveLeftovers = () => {
    const next: Pantry = { ...pantry, ...pantryAfter(lines) };
    setPantry(next); writeLS(PANTRY_KEY, next);
    flash("Остатки записаны — в следующий раз учту");
  };

  const clearPantry = () => { setPantry({}); writeLS(PANTRY_KEY, {}); flash("Кладовка очищена"); };

  const share = async () => {
    const text = listAsText(
      toBuyLines.map(l => ({ name: l.name, qty: l.packs > 0 ? l.buyAmount : l.toBuy, unit: l.unit })),
      title,
    );
    try {
      if (navigator.share) { await navigator.share({ title, text }); return; }
      await navigator.clipboard.writeText(text);
      flash("Скопировано ✓");
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      flash("Не вышло — выделите список вручную");
    }
  };

  return (
    <section className="card">
      <h3 className="card-h">{title}</h3>

      <div className="small muted" style={{ marginBottom: 6 }}>Где заказываете</div>
      <div className="chips">
        {SHOPS.map(s => (
          <button key={s.id} className={s.id === shopId ? "chip on" : "chip"}
            onClick={() => chooseShop(s.id)}>{s.name}</button>
        ))}
      </div>

      <div className="small muted" style={{ marginTop: 10, marginBottom: 6 }}>Что берём</div>
      <div className="chips">
        <button className={scope === "week" ? "chip on" : "chip"} onClick={() => setScope("week")}>
          Вся неделя
        </button>
        {grocery.byDay.map((d, i) => (
          <button key={d.day} className={scope === i ? "chip on" : "chip"} onClick={() => setScope(i)}>
            День {d.day}
          </button>
        ))}
      </div>

      <ul className="grocery shop-list">
        {toBuyLines.map((l, i) => (
          <LineRow key={i} line={l} shopId={shopId} favs={favs}
            onFav={rememberProduct} onHave={markHave} />
        ))}
      </ul>

      {haveLines.length > 0 && (
        <details className="have-block">
          <summary className="small muted">Уже есть дома: {haveLines.length}</summary>
          <ul className="grocery">
            {haveLines.map((l, i) => (
              <li key={i}>
                <span>{l.name}</span>
                <span className="small muted">{l.haveAtHome} {l.unit}</span>
              </li>
            ))}
          </ul>
          <button className="linkbtn small" onClick={clearPantry}>Очистить кладовку</button>
        </details>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
        <button className="chip" onClick={share}>Отправить список</button>
        <button className="chip" onClick={saveLeftovers}>Закупился</button>
        {msg && <span className="small muted" style={{ alignSelf: "center" }}>{msg}</span>}
      </div>

      <p className="small muted" style={{ marginTop: 10 }}>
        Количества приведены к реальным упаковкам: если нужно 100 г творога, а пачка 200 —
        приложение помнит, что 100 г останется, и в следующий раз не попросит покупать снова.
        Кнопка «запомнить» привязывает конкретный товар, чтобы не выбирать из двадцати
        видов помидоров каждую неделю. Сложить всё в корзину одной кнопкой нельзя —
        сервисы такого доступа снаружи не дают.
      </p>
    </section>
  );
}

/** Продукты для одного блюда — количества уже умножены на размер порции. */
export function MealIngredients({ meal }: { meal: Meal }) {
  const shopId = readLS(SHOP_KEY, DEFAULT_SHOP_ID);
  const shop = shopById(shopId);
  const favs = loadFavorites();
  const ings = (meal.recipe.ingredients ?? []).map(i => ({
    name: i.name,
    qty: +(i.qty * meal.servings).toFixed(1),
    unit: i.unit,
  }));

  if (!ings.length) return <div className="meal-ings small muted">Состав не указан.</div>;

  return (
    <div className="meal-ings">
      <div className="small muted">Продукты на эту порцию · «{shop.name}»</div>
      <ul>
        {ings.map((i, k) => {
          const { href, exact } = itemLink(i.name, shopId, favs);
          return (
            <li key={k}>
              <a className="shop-link" href={href} target="_blank" rel="noopener noreferrer">
                {i.name}<span className="shop-go" aria-hidden="true">{exact ? "★" : "→"}</span>
              </a>
              <span className="small muted">{i.qty} {i.unit}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
