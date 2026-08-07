import React from "react";
import { IconBack } from "./Icons.js";

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
<IconBack />
      </button>
      <h2>{title}</h2>
    </header>
  );
}
