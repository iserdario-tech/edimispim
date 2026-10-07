import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Ico } from "./Ico.js";
import type { IcoName } from "./icons.js";
import { tap } from "../ui/haptics.js";

/** Тур показан — больше сам не открывается; пройти заново — «Я → Как устроено приложение». */
export const TOUR_KEY = "edimispim.tourSeen";

const Dot = ({ c, k = "" }: { c: ReactNode; k?: string }) => <span className={"s-tour-dot " + k}>{c}</span>;
const Chip = ({ c, k = "" }: { c: string; k?: string }) => <span className={"s-tour-chip " + k}>{c}</span>;
const Row = ({ t, dot, k, what }: { t: string; dot: IcoName; k: string; what: string }) => (
  <div className="s-tour-row"><b>{t}</b><Dot c={<Ico name={dot} />} k={k} /><span>{what}</span></div>
);

/**
 * Каждая карточка — что это, зачем и копия настоящей кнопки, чтобы потом узнать её на экране.
 * Текст — не больше двух строк: тур читают один раз, на бегу.
 */
const SLIDES: { kicker: string; title: string; text: string; demo: ReactNode }[] = [
  {
    kicker: "edim & spim", title: "Сон и еда — одни сутки",
    text: "Как ты спал — меняет еду на день. Что и когда ты ешь — меняет сон. Приложение ведёт оба сразу.",
    demo: <><Row t="23:00" dot="bed" k="sleep" what="Отбой" /><Row t="07:00" dot="sun-2" k="sleep" what="Подъём и свет" /><Row t="07:30" dot="chef-hat" k="food" what="Завтрак под твою ночь" /></>,
  },
  {
    kicker: "Сутки", title: "Главный экран",
    text: "Сверху — слово дня и что будет дальше. Ниже лента: время → дело. Прошедшее бледнеет.",
    demo: <><span className="s-tour-small">вторник, 6 октября</span><b className="s-tour-word">Обычный день</b><span className="s-tour-next">Ужин в 20:00 · через 2 ч</span></>,
  },
  {
    kicker: "Лента", title: "Отмечай еду одним касанием",
    text: "Кружок справа — «съел». Смахни строку вправо — «ел своё». Нажми на строку — рецепт и продукты.",
    demo: <div className="s-tour-swipe"><Dot c={<Ico name="plate" />} k="food" /><span className="s-tour-check"><Ico name="check" mono /></span><i className="s-tour-small">съел</i><Chip c="своё →" k="food" /></div>,
  },
  {
    kicker: "Под заголовком", title: "Почему день такой",
    text: "Что поменялось из-за ночи и из чего сложился план. Там же — переключатели на сегодня.",
    demo: <><span className="s-tour-chip light"><Ico name="question-circle" /> Почему день такой</span><div className="s-tour-chips"><Chip c="Не готовлю" /><Chip c="Ем без плана" /><Chip c="Работаю допоздна" /></div></>,
  },
  {
    kicker: "+ и «Спросить»", title: "Записать и спросить",
    text: "«+» — съел, своё словами, вес, ночь. «Спросить» — вопрос коучу: он видит твой день и меню.",
    demo: <div className="s-tour-pair"><span><Dot c={<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5v15M4.5 12h15" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>} k="plus" /><i>записать</i></span><span><span className="s-tour-chip"><Ico name="chat-round-dots" /> Спросить</span><i>вопрос коучу</i></span></div>,
  },
  {
    kicker: "Еда", title: "Меню на неделю и покупки",
    text: "Стрелки по кругу — заменить блюдо, лупа — все блюда, «Список покупок» — по отделам магазина.",
    demo: <div className="s-tour-pair"><span><Dot c={<Ico name="refresh" />} /><i>заменить</i></span><span><Dot c={<Ico name="magnifer" mono />} /><i>все блюда</i></span><span><Chip c="Список покупок →" k="light" /></span></div>,
  },
  {
    kicker: "Я", title: "Вес, сон и настройки",
    text: "Вес и сколько калорий тратишь, режим сна, итоги недель, настройки и копия данных.",
    demo: <div className="s-tour-stats"><span><b>92 → 82</b>кг: сейчас → цель</span><span><b>≈2 270</b>тратишь ккал/день</span></div>,
  },
  {
    kicker: "Каждое утро", title: "Два тапа — и приложение учится",
    text: "Ответь «Как спал?» и «Что было вчера?». Через 1–2 недели увидишь, что влияет именно на твой сон.",
    demo: <div className="s-tour-faces">{(["confounded-circle", "sad-circle", "expressionless-circle", "smile-circle", "emoji-funny-circle"] as const).map(f => <Dot key={f} c={<Ico name={f} />} />)}</div>,
  },
];

/** «Как устроено приложение» — полноэкранные карточки, как история недели. */
export function Tour({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const s = SLIDES[i]!;
  const last = i === SLIDES.length - 1;
  const next = () => { tap(); if (last) onClose(); else setI(i + 1); };
  const prev = () => { tap(); if (i > 0) setI(i - 1); };

  return createPortal(
    <div className="s-story" role="dialog" aria-label={`Как устроено приложение: ${s.title}`}>
      <div className="s-story-bars">{SLIDES.map((_, k) => <span key={k} className={k <= i ? "on" : ""} />)}</div>
      <div className="s-story-top">
        <span>{i + 1} из {SLIDES.length}</span>
        <button aria-label="Закрыть" onClick={onClose}><Ico name="close" mono /></button>
      </div>
      <div className="s-story-tap" onClick={e => (e.clientX > window.innerWidth / 3 ? next() : prev())}>
        <div className="s-story-title">{s.kicker}</div>
        <div className="s-tour-h">{s.title}</div>
        <div className="s-story-sub">{s.text}</div>
        <div className="s-tour-demo" aria-hidden="true">{s.demo}</div>
      </div>
      <div className="s-story-actions">
        <button className="s-btn ghost" onClick={onClose}>{last ? "Закрыть" : "Пропустить"}</button>
        <button className="s-btn" onClick={next}>{last ? "Начать" : <>Дальше <Ico name="arrow-right" mono /></>}</button>
      </div>
    </div>,
    document.body,
  );
}
