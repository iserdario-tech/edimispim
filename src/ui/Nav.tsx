import React from "react";
import { IconToday, IconFood, IconProgress, IconCoach, IconProfile } from "./Icons.js";
import { tap } from "./haptics.js";

export type Tab = "today" | "food" | "progress" | "coach" | "profile";

/**
 * Нижняя навигация. Пять разделов — предел, который Apple ставит для панели вкладок
 * на iPhone, и мы стоим ровно на нём.
 *
 * Разделы — по РОЛИ, а не по «сну» и «еде»: вкладки «Сон» и «Еда» вернули бы то,
 * чего проект избегает, — два приложения в одном меню. Сутки остаются целыми
 * на экране «Сегодня», где сон и еда лежат на одной оси времени.
 *
 * Почему «Еда» всё-таки появилась отдельно: это раздел ДЕЙСТВИЯ (меню, холодильник,
 * покупки), а не половина суток. Раньше он жил внутри «Недели» вместе с итогами,
 * весом и плато — восемь карточек, где до списка покупок надо было пролистать
 * пять блоков аналитики.
 */
const TABS: { id: Tab; label: string; icon: (p: { bold?: boolean }) => React.JSX.Element }[] = [
  { id: "today", label: "Сегодня", icon: IconToday },
  { id: "food", label: "Еда", icon: IconFood },
  { id: "progress", label: "Итоги", icon: IconProgress },
  { id: "coach", label: "Вопрос", icon: IconCoach },
  { id: "profile", label: "Я", icon: IconProfile },
];

export function Nav({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="tabbar" aria-label="Основная навигация">
      {TABS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          className={"tab" + (tab === id ? " on" : "")}
          aria-current={tab === id ? "page" : undefined}
          onClick={() => { if (tab !== id) tap(); onChange(id); }}
        >
          <Icon bold={tab === id} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
