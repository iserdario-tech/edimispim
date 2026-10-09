import { useMemo, useState } from "react";
import { Sheet } from "../ui/Sheet.js";
import { tap } from "../ui/haptics.js";
import { composeReadyDay, partKcal, partProtein, partKcalFor, partProteinFor, packsRU, splitRU, cartOf, READY, type ReadyPart } from "../food/ready.js";
import { dayNumber } from "../food/schedule.js";
import { cartLinks, appProductUrl, APP_BASKET_URL, type CartResult } from "../ui/vvCart.js";
import type { MealCount, Targets } from "../food/types.js";

const SLOT_RU: Record<string, string> = { breakfast: "Завтрак", lunch: "Обед", dinner: "Ужин", snack: "Перекус", dessert: "Сладкое" };
const GOODS: Record<string, string> = { one: "товар", few: "товара", many: "товаров" };
const goods = (n: number) => `${n} ${GOODS[new Intl.PluralRules("ru").select(n)] ?? "товаров"}`;

/** Второй человек для дня на двоих: его цель, как его называть («ей», «ему», «партнёру») и откуда цель. */
export interface ReadyPartner { targets: Targets; them: string; note: string }

/**
 * «День без готовки»: рацион дня из готовой еды ВкусВилла под ту же цель, с товарами в приложении магазина.
 *
 * Для тех дней, когда готовить не хочется вовсе: салат, суп, запечённая курица, творог, фрукт.
 * Набор привязан к дате, «другой набор» листает варианты. Вдвоём обед и ужин общие и делятся поровну,
 * а завтрак, перекус и сладкое — одни продукты, но упаковок у каждого по своей цели: «тебе две, ей одну».
 * Её цель — из данных партнёра в «Готовим вдвоём» (или по паре); без них — как у тебя, и об этом сказано.
 *
 * Купить можно двумя путями. В приложении ВкусВилла: у каждого блюда кнопка «В приложении» открывает карточку
 * товара (universal link `/mobile?goods/ID`), там «В корзину». Корзину целиком приложение по чужому номеру не
 * открывает — проверено с телефона (`vvCart.ts`). На сайте: «Собрать корзину» даёт ссылку магазина, нужен вход.
 */
export function ReadySheet({ targets, mealCount, today, partner, onClose }: {
  targets: Targets; mealCount: MealCount; today: string;
  partner?: ReadyPartner;
  onClose: () => void;
}) {
  const [shift, setShift] = useState(0);
  const [people, setPeople] = useState<1 | 2>(1);
  const other: ReadyPartner = partner ?? { targets, them: "партнёру", note: "Данные партнёра не заполнены — считаю как у тебя. Заполни их в «Я → Готовим вдвоём», и цель станет точной." };
  const day = useMemo(() => composeReadyDay(targets, mealCount, dayNumber(today) + shift, undefined, people === 2 ? other.targets : undefined), [targets, mealCount, today, shift, people, other.targets]);
  const [cart, setCart] = useState<CartResult["links"] | "busy" | null>(null);
  const [err, setErr] = useState("");
  const Them = other.them.charAt(0).toUpperCase() + other.them.slice(1);

  // подпись части: одному — упаковки и калории; вдвоём — кому сколько и калории каждому
  const line = (part: ReadyPart): string => {
    const price = `${part.item.price} ₽ за упаковку`;
    if (people === 1) return `${packsRU(part.packs)} · ${partKcal(part)} ккал · белок ${partProtein(part)} г · ${price}${part.packs === 0.5 ? " · половина на завтра" : ""}`;
    const each = part.each ?? [part.packs / 2, part.packs / 2] as [number, number];
    const who = splitRU(each, other.them);
    if (each[0] === each[1]) return `${packsRU(part.packs)} · ${who} · ${partKcalFor(part, 0)} ккал каждому · белок ${partProteinFor(part, 0)} г · ${price}`;
    const kcal = each[1] === 0 ? `${partKcalFor(part, 0)} ккал тебе` : each[0] === 0 ? `${partKcalFor(part, 1)} ккал ${other.them}` : `${partKcalFor(part, 0)} ккал тебе, ${partKcalFor(part, 1)} ${other.them}`;
    return `${packsRU(part.packs)} · ${who} · ${kcal} · ${price}`;
  };
  const totalsLine = (i: 0 | 1, t: Targets) => {
    const m = day.each![i];
    return <>при цели {t.kcalTarget} · белок {m.protein} г{m.protein < t.proteinGTarget - 10 ? <span className="note-warn"> (цель {t.proteinGTarget})</span> : ""} · жиры {m.fat} г · клетчатка ≈{m.fiber} г</>;
  };

  return (
    <Sheet title="День без готовки" onClose={onClose}>
      <div className="seg" role="group" aria-label="На скольких человек">
        <button className={people === 1 ? "seg-item on" : "seg-item"} aria-pressed={people === 1} onClick={() => { tap(); setPeople(1); setCart(null); }}>На одного</button>
        <button className={people === 2 ? "seg-item on" : "seg-item"} aria-pressed={people === 2} onClick={() => { tap(); setPeople(2); setCart(null); }}>На двоих</button>
      </div>
      <p className="small muted">
        {people === 1
          ? <>Готовая еда ВкусВилла под твою цель на день: купил — и ешь.</>
          : <>Блюда общие, упаковок каждому по своей цели: обед и ужин — одно блюдо на двоих, завтрак, перекус и сладкое — своё количество. {other.note}</>}
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
                <span className="small muted">{line(part)}</span>
                <a className="linkbtn small" href={appProductUrl(part.item.id)} target="_blank" rel="noopener noreferrer">В приложении ВкусВилла</a>
              </span>
            ))}
          </li>
        ))}
      </ul>
      {people === 1 || !day.each
        ? <p className="ready-totals">
            <b>{day.totals.kcal} ккал</b> при цели {targets.kcalTarget} · белок {day.totals.protein} г
            {day.totals.protein < targets.proteinGTarget - 10 ? <span className="note-warn"> (цель {targets.proteinGTarget})</span> : ""} · жиры {day.totals.fat} г · клетчатка ≈{day.totals.fiber} г
            <br />К оплате {day.totals.price} ₽ за целые упаковки.
          </p>
        : <p className="ready-totals">
            <b>Тебе {day.each[0].kcal} ккал</b> {totalsLine(0, targets)}
            <br /><b>{Them} {day.each[1].kcal} ккал</b> {totalsLine(1, other.targets)}
            <br />К оплате {day.totals.price} ₽ за целые упаковки на двоих.
          </p>}
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
