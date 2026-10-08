import { useMemo, useState } from "react";
import { Sheet } from "../ui/Sheet.js";
import { tap } from "../ui/haptics.js";
import { composeReadyDay, partKcal, partProtein, packsRU, cartOf, READY } from "../food/ready.js";
import { dayNumber } from "../food/schedule.js";
import { cartLinks, type CartResult } from "../ui/vvCart.js";
import type { MealCount, Targets } from "../food/types.js";

const SLOT_RU: Record<string, string> = { breakfast: "Завтрак", lunch: "Обед", dinner: "Ужин", snack: "Перекус", dessert: "Сладкое" };
const GOODS: Record<string, string> = { one: "товар", few: "товара", many: "товаров" };

/**
 * «День без готовки»: рацион дня из готовой еды ВкусВилла под ту же цель — и корзина одним нажатием.
 *
 * Для тех дней, когда готовить не хочется вовсе: салат, суп, запечённая курица, творог, фрукт.
 * Набор привязан к дате, «другой набор» листает варианты. Корзина собирается через наш воркер.
 */
export function ReadySheet({ targets, mealCount, today, onClose }: { targets: Targets; mealCount: MealCount; today: string; onClose: () => void }) {
  const [shift, setShift] = useState(0);
  const day = useMemo(() => composeReadyDay(targets, mealCount, dayNumber(today) + shift), [targets, mealCount, today, shift]);
  const [cart, setCart] = useState<CartResult["links"] | "busy" | null>(null);
  const [err, setErr] = useState("");
  const pDev = day.totals.protein - targets.proteinGTarget;

  return (
    <Sheet title="День без готовки" onClose={onClose}>
      <p className="small muted mt-0">
        Готовая еда ВкусВилла под твою цель на день: купил — и ешь. КБЖУ с этикеток магазина на {READY.date.slice(8, 10)}.{READY.date.slice(5, 7)},
        клетчатка ≈ по типу блюда. Цены и наличие — на момент заказа.
      </p>
      {day.picks.length === 0 && <p className="small note-warn">Не из чего собрать: каталог пуст. Обнови его скриптом.</p>}
      <ul className="ready-list">
        {day.picks.map(p => (
          <li key={p.slot}>
            <span className="small muted">{SLOT_RU[p.slot] ?? p.slot}</span>
            {p.parts.map(part => (
              <span key={part.item.xml_id} className="ready-part">
                <b>{part.item.name}</b>
                <span className="small muted">{packsRU(part.packs)} · {partKcal(part)} ккал · белок {partProtein(part)} г · {part.item.price} ₽{part.packs === 0.5 ? " · половина на завтра" : ""}</span>
              </span>
            ))}
          </li>
        ))}
      </ul>
      <p className="ready-totals">
        <b>{day.totals.kcal} ккал</b> при цели {targets.kcalTarget} · белок {day.totals.protein} г
        {pDev < -10 ? <span className="note-warn"> (цель {targets.proteinGTarget})</span> : ""} · жиры {day.totals.fat} г · клетчатка ≈{day.totals.fiber} г · к оплате {day.totals.price} ₽ за целые упаковки
      </p>
      <div className="btn-row">
        <button className="s-btn ghost" onClick={() => { tap(); setShift(shift + 1); setCart(null); }}>Другой набор</button>
        <button className="s-btn food" disabled={cart === "busy" || !day.picks.length} onClick={async () => {
          tap(); setCart("busy"); setErr("");
          try { setCart(await cartLinks(cartOf(day))); }
          catch { setCart(null); setErr("Магазин не ответил. Попробуй ещё раз."); }
        }}>{cart === "busy" ? "Собираю…" : "Собрать корзину"}</button>
      </div>
      {err && <p className="small note-warn">{err}</p>}
      {Array.isArray(cart) && (
        <p className="small">
          {cart.map((l, k) => <span key={k}>{k > 0 && " · "}<a href={l.url} target="_blank" rel="noopener noreferrer">Открыть корзину{cart.length > 1 ? ` ${k + 1}` : ""} · {l.count} {GOODS[new Intl.PluralRules("ru").select(l.count)] ?? "товаров"}</a></span>)}
        </p>
      )}
    </Sheet>
  );
}
