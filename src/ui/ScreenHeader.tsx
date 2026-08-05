import React from "react";

/**
 * Шапка вложенного экрана: стрелка назад и заголовок.
 *
 * Без неё из настроек можно было выйти только «сохранив» — а если человек зашёл посмотреть,
 * ему приходилось подтверждать то, что он менять не собирался. Возврат идёт туда, откуда
 * пришёл, а не на первый экран.
 */
export function ScreenHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="screen-head">
      <button className="back-btn" onClick={onBack} aria-label="Назад">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <h2>{title}</h2>
    </header>
  );
}
