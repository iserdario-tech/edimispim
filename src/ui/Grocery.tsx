import React, { useState } from "react";
import type { Grocery, GroceryItem, Meal } from "../food/types.js";
import { SHOPS, DEFAULT_SHOP_ID, shopById, searchUrl, listAsText } from "../food/shops.js";

/** Выбранный сервис живёт между запусками — незачем выбирать его каждый раз. */
const SHOP_KEY = "edimispim.shop";
const savedShopId = (): string => {
  try { return localStorage.getItem(SHOP_KEY) ?? DEFAULT_SHOP_ID; } catch { return DEFAULT_SHOP_ID; }
};

/**
 * Продукты для одного блюда: количества уже умножены на размер порции,
 * поэтому в списке ровно то, что нужно купить именно под этот приём пищи.
 */
export function MealIngredients({ meal }: { meal: Meal }) {
  const shop = shopById(savedShopId());
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
        {ings.map((i, k) => (
          <li key={k}>
            <a className="shop-link" href={searchUrl(shop, i.name)} target="_blank" rel="noopener noreferrer">
              {i.name}<span className="shop-go" aria-hidden="true">→</span>
            </a>
            <span className="small muted">{i.qty} {i.unit}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Покупки с переходом в сервис доставки.
 *
 * Честно про возможности: положить всё в корзину одной кнопкой нельзя — публичных API
 * у сервисов нет, только партнёрские по договору. Поэтому интерфейс не обещает
 * «заказать», а делает то, что реально работает: открывает поиск нужного товара
 * в выбранном сервисе и даёт скопировать весь список разом.
 */
export function GroceryBlock({ grocery }: { grocery: Grocery }) {
  const [shopId, setShopId] = useState(savedShopId);
  const [scope, setScope] = useState<"week" | number>("week");
  const [copied, setCopied] = useState("");

  const shop = shopById(shopId);
  const chooseShop = (id: string) => {
    setShopId(id);
    try { localStorage.setItem(SHOP_KEY, id); } catch { /* приватный режим — не беда */ }
  };

  const day = typeof scope === "number" ? grocery.byDay[scope] : null;
  const items: GroceryItem[] = day ? day.items : grocery.items;
  const cost = day ? day.estCostRub : grocery.estCostRub;
  const title = day ? `Покупки на день ${day.day}` : "Покупки на неделю";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(listAsText(items, title));
      setCopied("Список скопирован ✓");
    } catch {
      setCopied("Не вышло скопировать — выделите список вручную");
    }
    setTimeout(() => setCopied(""), 3000);
  };

  return (
    <section className="card">
      <h3 className="card-h">{title} · ≈{cost} ₽</h3>

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
        {items.map((it, i) => (
          <li key={i}>
            <a className="shop-link" href={searchUrl(shop, it.name)} target="_blank" rel="noopener noreferrer">
              {it.name}
              <span className="shop-go" aria-hidden="true">→</span>
            </a>
            <span className="small muted">
              {it.qty} {it.unit}{it.perishable ? " · скоропорт" : ""}
            </span>
          </li>
        ))}
      </ul>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
        <button className="chip" onClick={copy}>Скопировать список</button>
        {copied && <span className="small muted" style={{ alignSelf: "center" }}>{copied}</span>}
      </div>

      <p className="small muted" style={{ marginTop: 10 }}>
        Тап по продукту открывает его поиск в «{shop.name}». Сложить всё в корзину одной
        кнопкой нельзя: сервисы такого доступа снаружи не дают. Цены здесь — прикидка
        приложения, а не цены магазина.
      </p>
    </section>
  );
}
