import { useMemo, useState } from "react";
import { Sheet } from "../ui/Sheet.js";
import { tap } from "../ui/haptics.js";
import { composeReadyDay, partKcal, partProtein, packsRU, eachRU, cartOf, READY } from "../food/ready.js";
import { dayNumber } from "../food/schedule.js";
import { cartLinks, appProductUrl, APP_BASKET_URL, type CartResult } from "../ui/vvCart.js";
import type { MealCount, Targets } from "../food/types.js";

const SLOT_RU: Record<string, string> = { breakfast: "Завтрак", lunch: "Обед", dinner: "Ужин", snack: "Перекус", dessert: "Сладкое" };
const GOODS: Record<string, string> = { one: "товар", few: "товара", many: "товаров" };
const goods = (n: number) => `${n} ${GOODS[new Intl.PluralRules("ru").select(n)] ?? "товаров"}`;

/**
 * «День без готовки»: рацион дня из готовой еды ВкусВилла под ту же цель — и корзина одним нажатием.
 *
 * Для тех дней, когда готовить не хочется вовсе: салат, суп, запечённая курица, творог, фрукт.
 * Набор привязан к дате, «другой набор» листает варианты. Вдвоём — блюда общие и делятся поровну:
 * цель — сумма твоей и партнёра (если пара настроена и его калории известны), упаковки крупнее,
 * у каждой части подпись «по половине каждому». Корзина собирается через наш воркер.
 *
 * Купить можно двумя путями. В приложении ВкусВилла: у каждого блюда кнопка «В приложении» открывает карточку
 * товара (universal link `/mobile?goods/ID`), там «В корзину». Корзину целиком приложение по чужому номеру не
 * открывает — проверено с телефона (`vvCart.ts`). На сайте: «Собрать корзину» даёт ссылку магазина, нужен вход.
 */
export function ReadySheet({ targets, mealCount, today, partnerKcal, onClose }: {
  targets: Targets; mealCount: MealCount; today: string;
  /** Калории партнёра по паре, если известны. */
  partnerKcal?: number;
  onClose: () => void;
}) {
  const [shift, setShift] = useState(0);
  const [people, setPeople] = useState<1 | 2>(1);
  // на двоих цель складывается: твоя плюс партнёра; без пары — как у тебя, и об этом сказано
  const combined = useMemo<Targets>(() => people === 1 ? targets : {
    ...targets,
    kcalTarget: Math.round(targets.kcalTarget + (partnerKcal ?? targets.kcalTarget)),
    proteinGTarget: Math.round(targets.proteinGTarget * (1 + (partnerKcal ?? targets.kcalTarget) / targets.kcalTarget)),
  }, [targets, people, partnerKcal]);
  const day = useMemo(() => composeReadyDay(combined, mealCount, dayNumber(today) + shift, undefined, people), [combined, mealCount, today, shift, people]);
  const [cart, setCart] = useState<CartResult["links"] | "busy" | null>(null);
  const [err, setErr] = useState("");
  const perPerson = (n: number) => Math.round(n / people);
  const pDev = day.totals.protein - combined.proteinGTarget;

  return (
    <Sheet title="День без готовки" onClose={onClose}>
      <div className="seg" role="group" aria-label="На скольких человек">
        <button className={people === 1 ? "seg-item on" : "seg-item"} aria-pressed={people === 1} onClick={() => { tap(); setPeople(1); setCart(null); }}>На одного</button>
        <button className={people === 2 ? "seg-item on" : "seg-item"} aria-pressed={people === 2} onClick={() => { tap(); setPeople(2); setCart(null); }}>На двоих</button>
      </div>
      <p className="small muted">
        {people === 1
          ? <>Готовая еда ВкусВилла под твою цель на день: купил — и ешь.</>
          : partnerKcal
            ? <>Общие блюда на двоих, делите поровну. Цель — твоя {targets.kcalTarget} ккал плюс партнёра {Math.round(partnerKcal)}.</>
            : <>Общие блюда на двоих, делите поровну. Калории партнёра не известны — считаю как у тебя; настрой пару в «Я → Готовим вдвоём», и цель станет точной.</>}
        {" "}КБЖУ с этикеток магазина на {READY.date.slice(8, 10)}.{READY.date.slice(5, 7)}, клетчатка ≈ по типу блюда. Цены и наличие — на момент заказа.
      </p>
      {day.picks.length === 0 && <p className="small note-warn">Не из чего собрать: каталог пуст. Обнови его скриптом.</p>}
      <ul className="ready-list">
        {day.picks.map(p => (
          <li key={p.slot}>
            <span className="small muted">{SLOT_RU[p.slot] ?? p.slot}</span>
            {p.parts.map(part => (
              <span key={part.item.xml_id} className="ready-part">
                <b>{part.item.name}</b>
                <span className="small muted">
                  {packsRU(part.packs)}{people === 2 ? ` · ${eachRU(part.packs, 2)}` : ""} · {perPerson(partKcal(part))} ккал{people === 2 ? " каждому" : ""} · белок {perPerson(partProtein(part))} г · {part.item.price} ₽ за упаковку
                  {people === 1 && part.packs === 0.5 ? " · половина на завтра" : ""}
                </span>
                <a className="linkbtn small" href={appProductUrl(part.item.id)} target="_blank" rel="noopener noreferrer">В приложении ВкусВилла</a>
              </span>
            ))}
          </li>
        ))}
      </ul>
      <p className="ready-totals">
        <b>{perPerson(day.totals.kcal)} ккал{people === 2 ? " каждому" : ""}</b> при цели {perPerson(combined.kcalTarget)} · белок {perPerson(day.totals.protein)} г
        {pDev < -10 * people ? <span className="note-warn"> (цель {perPerson(combined.proteinGTarget)})</span> : ""} · жиры {perPerson(day.totals.fat)} г · клетчатка ≈{perPerson(day.totals.fiber)} г
        <br />К оплате {day.totals.price} ₽ за целые упаковки{people === 2 ? " на двоих" : ""}.
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
      {Array.isArray(cart) && cart.map((l, k) => (
        <a key={k} className="s-btn food s-wide" href={l.url} target="_blank" rel="noopener noreferrer">
          Открыть корзину на сайте{cart.length > 1 ? ` · часть ${k + 1}` : ""} · {goods(l.count)}
        </a>
      ))}
      <p className="small muted">
        В приложении ВкусВилла: открой каждое блюдо кнопкой «В приложении» и нажми там «В корзину» — столько упаковок,
        сколько указано. Корзину целиком приложение по ссылке не принимает. На сайте корзина открывается одной ссылкой,
        но нужен вход.
      </p>
      <a className="linkbtn small" href={APP_BASKET_URL} target="_blank" rel="noopener noreferrer">Корзина в приложении</a>
    </Sheet>
  );
}
