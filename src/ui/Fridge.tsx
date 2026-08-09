import React, { useMemo, useState } from "react";
import type { Pantry } from "../food/packaging.js";
import { coverageOf } from "../food/packaging.js";
import { NUTRIENTS, isLiquid } from "../food/nutrients.js";
import { hintFor } from "../food/ingredients.js";
import type { Recipe } from "../food/types.js";
import { tap } from "./haptics.js";
import { amountRU } from "./Grocery.js";

/**
 * Холодильник: что есть дома и сколько.
 *
 * Кладовка в приложении была и раньше, но заполнялась только галочками в списке покупок —
 * то есть знала лишь про то, что куплено по плану. Всё остальное, что реально лежит дома,
 * приложению было невидимо: оно исправно предлагало купить то, что уже есть.
 *
 * Отсюда кладовку читают ещё двое: список покупок вычитает домашнее из закупки,
 * а замена блюда в меню сначала предлагает то, что готовится без похода в магазин.
 */

/** Единица по умолчанию: штучное — штуками, жидкое — миллилитрами, остальное — граммами. */
const PIECE = /яйц|банан|хлеб|лаваш|тортилья|перец болгарский|авокадо|огурец|помидор/i;
const defaultUnit = (name: string): string =>
  PIECE.test(name) ? "шт" : isLiquid(name) ? "мл" : "г";

const key = (name: string, unit: string): string => `${name.toLowerCase().trim()}|${unit}`;
const parseKey = (k: string): { name: string; unit: string } => {
  const i = k.lastIndexOf("|");
  return i < 0 ? { name: k, unit: "г" } : { name: k.slice(0, i), unit: k.slice(i + 1) };
};

/** Справочник для подсказок ввода: те же продукты, из которых собраны рецепты. */
const KNOWN = Object.keys(NUTRIENTS).sort((a, b) => a.localeCompare(b, "ru"));

/** «1 позиция», «3 позиции», «11 позиций», «21 позиция» — по-русски, а не по числу меньше пяти. */
const positionsRU = (n: number): string => {
  const ten = n % 10, hundred = n % 100;
  if (ten === 1 && hundred !== 11) return `${n} позиция`;
  if (ten >= 2 && ten <= 4 && (hundred < 12 || hundred > 14)) return `${n} позиции`;
  return `${n} позиций`;
};

export function Fridge({ pantry, onPantry, pool }: {
  pantry: Pantry;
  onPantry: (next: Pantry) => void;
  /** Из чего предлагать готовку — уже отфильтрованный под человека набор. */
  pool: Recipe[];
}) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [open, setOpen] = useState(false);

  const items = useMemo(
    () => Object.entries(pantry)
      .map(([k, v]) => ({ ...parseKey(k), qty: v, key: k }))
      .sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [pantry],
  );

  const add = () => {
    const n = name.trim().toLowerCase();
    const q = +qty.replace(",", ".");
    if (!n || !(q > 0)) return;
    tap();
    onPantry({ ...pantry, [key(n, defaultUnit(n))]: q });
    setName(""); setQty("");
  };

  const remove = (k: string) => {
    const next = { ...pantry };
    delete next[k];
    onPantry(next);
  };

  /** Что можно приготовить прямо сейчас — по доле состава, которая уже дома. */
  const cookable = useMemo(() => {
    if (!items.length) return [];
    return pool
      .map(r => ({ recipe: r, cov: coverageOf(r.ingredients ?? [], pantry) }))
      .filter(x => x.cov.share > 0.5)
      .sort((a, b) => b.cov.share - a.cov.share)
      .slice(0, 6);
  }, [pool, pantry, items.length]);

  return (
    <section className="card">
      <div className="menu-head">
        <h3 className="card-h" style={{ margin: 0 }}>Холодильник</h3>
        <button className="linkbtn small" onClick={() => setOpen(!open)}>
          {open ? "свернуть" : items.length ? positionsRU(items.length) : "заполнить"}
        </button>
      </div>

      {open && (
        <>
          <p className="small muted">
            Что лежит дома и сколько. Покупки вычтут это из списка, а замена блюда в меню
            сначала предложит то, что готовится без похода в магазин.
          </p>

          <div className="fridge-add">
            <input list="fridge-known" type="text" value={name} placeholder="продукт"
              aria-label="Название продукта"
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") add(); }} />
            <datalist id="fridge-known">
              {KNOWN.map(n => <option key={n} value={n} />)}
            </datalist>
            <input type="number" inputMode="decimal" min="0" step="1" value={qty}
              placeholder={`сколько, ${defaultUnit(name)}`} aria-label={`Количество, ${defaultUnit(name)}`}
              onChange={e => setQty(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") add(); }} />
            <button className="chip on" onClick={add} disabled={!name.trim() || !(+qty.replace(",", ".") > 0)}>
              Добавить
            </button>
          </div>

          {items.length === 0 ? (
            <p className="small muted">Пока пусто. Продукты появятся и сами — от галочек в покупках.</p>
          ) : (
            <ul className="fridge-list">
              {items.map(it => {
                const hint = hintFor(it.name);
                return (
                  <li key={it.key}>
                    <span className="fridge-name">
                      {it.name}
                      {hint && <span className="small muted"> · {hint.what}</span>}
                    </span>
                    <span className="small muted">{amountRU(it.qty, it.unit)}</span>
                    <button className="linkbtn small" aria-label={`Убрать ${it.name}`}
                      onClick={() => remove(it.key)}>убрать</button>
                  </li>
                );
              })}
            </ul>
          )}

          {cookable.length > 0 && (
            <>
              <div className="small muted" style={{ marginTop: 12 }}>Можно приготовить из того, что есть</div>
              <ul className="fridge-list">
                {cookable.map(({ recipe, cov }) => (
                  <li key={recipe.id}>
                    <span className="fridge-name">{recipe.name}</span>
                    <span className="small muted">
                      {cov.missing.length === 0
                        ? "всё есть"
                        : `не хватает: ${cov.missing.slice(0, 3).join(", ")}`}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
