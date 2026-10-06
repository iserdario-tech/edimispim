import React, { useMemo, useState } from "react";
import { planPurchase, type BuyLine } from "../food/packaging.js";
import { SHOPS, DEFAULT_SHOP_ID } from "../food/shops.js";
import { AISLES, OTHER, aisleOf, pantryKey, itemLink, amountRU, showsLeftover } from "../ui/Grocery.js";
import { Fridge } from "../ui/Fridge.js";
import { shareText, shareNoteRU } from "../ui/share.js";
import { readLS, writeLS, SHOP_KEY } from "../ui/localStore.js";
import { tap } from "../ui/haptics.js";
import type { WeekModel } from "./useWeek.js";

const DOW = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

/**
 * «В магазине» — отдельный режим, а не карточка внизу «Еды».
 *
 * В магазине нужен только список: крупные галочки, отделы зала, прогресс. Отмеченное
 * не уезжает из-под пальца — вычёркивается на месте. «Дома есть» — та же кладовка,
 * из которой замена блюда предлагает «приготовить из того, что есть».
 */
export function Shop({ week, onBack }: { week: WeekModel; onBack: () => void }) {
  const plan = week.plan!;
  const [view, setView] = useState<"buy" | "home">("buy");
  const [scope, setScope] = useState<"week" | number>("week");
  const [shopId, setShopId] = useState(() => readLS(SHOP_KEY, DEFAULT_SHOP_ID));
  const [note, setNote] = useState("");
  const items = scope === "week" ? plan.grocery.items : plan.grocery.byDay[scope]?.items ?? [];
  const lines = useMemo(() => planPurchase(items, week.pantry).filter(l => !l.staple), [items, week.pantry]);
  const done = lines.filter(l => l.toBuy === 0).length;
  const label = (i: number) => i === 0 ? "сегодня" : i === 1 ? "завтра" : DOW[new Date(plan.days[i]!.date + "T12:00:00").getDay()]!;

  const groups = useMemo(() => {
    const m = new Map<string, { ru: string; items: BuyLine[] }>();
    for (const l of lines) { const a = aisleOf(l.category); const g = m.get(a.id) ?? { ru: a.ru, items: [] }; g.items.push(l); m.set(a.id, g); }
    const order = [...AISLES.map(a => a.id), OTHER.id];
    return [...m.entries()].sort((x, y) => order.indexOf(x[0]) - order.indexOf(y[0])).map(([, g]) => g);
  }, [lines]);

  const toggle = (l: BuyLine, checked: boolean) => {
    tap();
    const next = { ...week.pantry };
    if (checked) next[pantryKey(l.name, l.unit)] = l.need + l.leftover; else delete next[pantryKey(l.name, l.unit)];
    week.savePantry(next);
  };
  const qty = (l: BuyLine) => l.packs > 0 ? `${l.packs} × ${amountRU(l.packSize, l.unit)}` : amountRU(l.toBuy || l.need, l.unit);

  return (
    <main className="s-screen">
      <button className="s-back" onClick={onBack}>‹ Еда</button>
      <h1 className="s-title">В магазине</h1>
      <div className="s-seg">
        <button className={view === "buy" ? "on" : ""} onClick={() => setView("buy")}>Купить</button>
        <button className={view === "home" ? "on" : ""} onClick={() => setView("home")}>Дома есть</button>
      </div>

      {view === "home" ? <div className="s-legacy"><Fridge pantry={week.pantry} onPantry={week.savePantry} pool={plan.pool} /></div> : (
        <>
          <div className="s-chips-row">
            <button className={scope === "week" ? "s-pill on" : "s-pill"} onClick={() => setScope("week")}>неделя</button>
            {plan.days.slice(0, 7).map((_, i) => (
              <button key={i} className={scope === i ? "s-pill on" : "s-pill"} onClick={() => setScope(i)}>{label(i)}</button>
            ))}
          </div>
          <p className="s-sub">взял {done} из {lines.length}</p>
          <div className="s-progress"><span style={{ width: `${lines.length ? (done / lines.length) * 100 : 0}%` }} /></div>

          {groups.map(g => (
            <section key={g.ru} className="s-aisle">
              <h2 className="s-aisle-h">{g.ru}</h2>
              {g.items.map(l => {
                const checked = l.toBuy === 0;
                return (
                  <div key={l.name + l.unit} className={"s-buy" + (checked ? " done" : "")}>
                    <button className={"s-check" + (checked ? " on" : "")} aria-pressed={checked} aria-label={`Взял ${l.name}`} onClick={() => toggle(l, !checked)}>{checked ? "✓" : ""}</button>
                    <a className="s-buy-name" href={itemLink(l.name, shopId)} target="_blank" rel="noopener noreferrer">{l.name}</a>
                    <span className="s-buy-qty">{checked ? "есть" : qty(l)}{!checked && showsLeftover(l) ? <small>останется {amountRU(l.leftover, l.unit)}</small> : null}</span>
                  </div>
                );
              })}
            </section>
          ))}

          <button className="s-btn ghost s-wide" onClick={async () => {
            tap();
            const text = ["Покупки", ...groups.flatMap(g => {
              const left = g.items.filter(l => l.toBuy > 0);
              return left.length ? ["", g.ru + ":", ...left.map(l => `• ${l.name} — ${qty(l)}`)] : [];
            })].join("\n");
            setNote(shareNoteRU(await shareText("Покупки", text)));
          }}>Отправить список в чат</button>
          {note && <p className="s-small">{note}</p>}
          <div className="s-chips-row s-shops">
            <span className="s-small">Тап по продукту ищет его в</span>
            {SHOPS.map(s => (
              <button key={s.id} className={s.id === shopId ? "s-pill on" : "s-pill"} onClick={() => { setShopId(s.id); writeLS(SHOP_KEY, s.id); }}>{s.name}</button>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
