import React from "react";
import { IconToday, IconWeek, IconCoach, IconProfile } from "./Icons.js";

export type Tab = "today" | "week" | "coach" | "profile";

/**
 * Нижняя навигация.
 *
 * Разделы — по времени и роли, а НЕ по «сну» и «еде». Вкладки «Сон» и «Еда» вернули бы
 * ровно то, чего проект избегает: два приложения в одном меню. Сутки остаются целыми.
 */
const TABS: { id: Tab; label: string; icon: (p: { bold?: boolean }) => React.JSX.Element }[] = [
  { id: "today", label: "Сегодня", icon: IconToday },
  { id: "week", label: "Неделя", icon: IconWeek },
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
          onClick={() => onChange(id)}
        >
          <Icon bold={tab === id} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
