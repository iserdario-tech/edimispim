import { useState } from "react";
import { Sheet } from "../ui/Sheet.js";
import { regularityScore } from "../index.js";
import type { DayToggles } from "../index.js";
import { enableNotifications } from "../ui/notifications.js";
import { tap } from "../ui/haptics.js";
import type { DayModel } from "./useDay.js";
import type { AppModel } from "./Shell.js";

const dur = (min: number) => `${Math.floor(min / 60)} ч ${String(Math.round(min % 60)).padStart(2, "0")}`;

/**
 * «Почему так» — всё, что раньше стояло абзацами в ленте, теперь в одной шторке:
 * объяснение дня, что поменялось из-за ночи, из чего сложилось (полоски вкладов,
 * как у WHOOP), личный эффект «вчера было?» и настройка дня «Сегодня всё иначе?».
 */
export function WhySheet({ app, day, onClose }: { app: AppModel; day: DayModel; onClose: () => void }) {
  const state = app.state!;
  const a = app.actions;
  const [notif, setNotif] = useState("");
  const target = state.profile.targetSleepMin;
  const deficit = day.sleptMin !== undefined ? target - day.sleptMin : undefined;
  const reg = regularityScore(state.history, day.today);
  const alcohol = !!(day.logged?.hadAlcohol || state.yesterday?.[day.today]?.alcohol);
  const bars: [string, number, string][] = [
    ["Сон", deficit !== undefined ? Math.max(0, Math.min(1, deficit / 180)) : 0,
      deficit === undefined ? (day.logged ? "отбой не указан" : "ночь не отмечена") : deficit > 15 ? `−${dur(deficit)}` : "в норме"],
    ["Режим", reg === null ? 0 : Math.max(0, Math.min(1, (100 - reg) / 100)), reg === null ? "мало данных" : reg >= 80 ? "ровный" : reg >= 60 ? "плавает" : "скачет"],
    ["Алкоголь", alcohol ? 0.6 : 0, alcohol ? "был" : "не было"],
  ];
  const t = (k: keyof DayToggles) => day.setToggles({ ...day.toggles, [k]: !day.toggles[k] });
  const ready = day.effects.filter(e => e.ready);
  const waiting = day.effects.filter(e => !e.ready);

  return (
    <Sheet title={`Почему: ${day.word.word.toLowerCase()}`} onClose={onClose}>
      <p className="s-why-text">{day.explanation.textRU}</p>

      {day.foodDay && day.foodDay.changes.length > 0 && (
        <>
          <h3 className="s-why-h">Что поменялось из-за ночи</h3>
          <ul className="s-why-list">{day.foodDay.changes.map(c => <li key={c}>{c}</li>)}</ul>
        </>
      )}

      <h3 className="s-why-h">Из чего сложилось</h3>
      {bars.map(([label, v, text]) => (
        <div key={label} className="s-bar">
          <span>{label}</span>
          <span className="s-bar-track"><span style={{ width: `${v * 100}%` }} /></span>
          <span className="s-small">{text}</span>
        </div>
      ))}

      <h3 className="s-why-h">Заметили</h3>
      {ready.length
        ? <ul className="s-why-list">{ready.map(e => <li key={e.factor}>{e.textRU}</li>)}</ul>
        : <p className="s-muted">
            Отвечай утром на «Вчера было?» — когда наберётся по 5 «да» и «нет», здесь появится,
            как поздний ужин, кофе и алкоголь влияют именно на твой сон
            {waiting[0] ? ` (сейчас ${waiting[0].yes} «да» и ${waiting[0].no} «нет» про ужин)` : ""}.
          </p>}

      <h3 className="s-why-h">Сегодня всё иначе?</h3>
      <div className="s-chips">
        {([["normal", "Обычный"], ["crunch", "Допоздна"], ["recovery", "Отсыпаюсь"]] as const).map(([v, ru]) => (
          <button key={v} className={day.mode === v ? "s-pill on" : "s-pill"} onClick={() => { tap(); day.setMode(v); }}>{ru}</button>
        ))}
      </div>
      {day.mode === "crunch" && (
        <label className="s-field">До скольких работаешь
          <input type="time" value={day.crunchEndHM} onChange={e => day.setCrunchEndHM(e.target.value)} />
        </label>
      )}
      <div className="s-chips">
        {([["napUnavailable", "Не вздремнуть"], ["noBrightLight", "Нет света"], ["noCaffeine", "Без кофеина"], ["hadAlcohol", "Был алкоголь"]] as const).map(([k, ru]) => (
          <button key={k} className={day.toggles[k] ? "s-pill on" : "s-pill"} onClick={() => { tap(); t(k); }}>{ru}</button>
        ))}
      </div>
      <div className="s-chips">
        {state.food && (
          <button className={day.noCook ? "s-pill on" : "s-pill"} onClick={() => { tap(); a.setNoCook(day.today, !day.noCook); }}>Не готовлю</button>
        )}
        <button className={day.cheat ? "s-pill on" : "s-pill"} onClick={() => { tap(); a.setCheatDay(day.today, !day.cheat); }}>Свободный день</button>
        <button className="s-pill" onClick={async () => setNotif(await enableNotifications(state.profile))}>Напоминания</button>
      </div>
      {notif && <p className="s-small">{notif}</p>}
      <p className="s-small s-why-src">
        Наука: недосып поднимает аппетит примерно на 250 ккал и роняет самоконтроль — поэтому
        после плохой ночи калории те же, а день проще. Источники — в «Я» → «О приложении».
      </p>
    </Sheet>
  );
}
