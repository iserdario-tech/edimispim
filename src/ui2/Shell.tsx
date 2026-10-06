import React, { useRef, useState } from "react";
import { useAppState, pickUpOldApps } from "../ui/useAppState.js";
import { QuickStart } from "../ui/QuickStart.js";
import { syncPushContext } from "../ui/notifications.js";
import { useNow } from "../ui/useNow.js";
import { localMinutes } from "../today-date.js";
import { skyFor, skyGradient } from "../sky.js";
import { useDarkTheme } from "./useNight.js";
import { tap } from "../ui/haptics.js";

export type Tab2 = "day" | "eat" | "me";
export type AppModel = ReturnType<typeof useAppState>;

/**
 * Оболочка 2.0: три вкладки «Сутки · Еда · Я», круг «?» (коуч) и плавающая «+».
 *
 * Вкладки — навигация, а действие — отдельная кнопка: так требует HIG, и так устроены
 * Oura и Gentler Streak, сократившие панель до трёх разделов. «Итоги» и «Вопрос» перестали
 * быть вкладками: итоги живут в «Я» и в истории недели, коуч — в шторке.
 */
export function Shell() {
  const app = useAppState();
  const [tab, setTab] = useState<Tab2>("day");
  const fileRef = useRef<HTMLInputElement>(null);
  const now = useNow();
  const dark = useDarkTheme();
  const sky = skyFor(localMinutes(now), dark);

  const restoreInput = (
    <input ref={fileRef} type="file" accept="application/json,.json" hidden
      onChange={(e) => { const f = e.target.files?.[0]; if (f) void app.actions.restore(f); e.target.value = ""; }} />
  );

  if (!app.state) {
    return <div className={"v2" + (sky.night ? " night" : "")}>
      <div className="s-sky" style={{ background: skyGradient(sky.stops) }} />
      <QuickStart onRestore={() => fileRef.current?.click()}
        onDone={(profile, screener, quickFood) => {
          const picked = pickUpOldApps();
          const food = picked.food ?? quickFood;
          app.update({
            profile, history: picked.history, screener, food,
            ...(picked.weights.length ? { weights: picked.weights } : {}),
          });
          void syncPushContext(profile);
        }} />
      {restoreInput}
    </div>;
  }

  return (
    <div className={"v2" + (sky.night ? " night" : "")}>
      <div className="s-sky" style={{ background: skyGradient(sky.stops) }} />
      <main className="s-screen">
        {tab === "day" && <h1 className="s-title">Сутки</h1>}
        {tab === "eat" && <h1 className="s-title">Еда</h1>}
        {tab === "me" && <h1 className="s-title">Я</h1>}
      </main>

      <nav className="s-tabbar" aria-label="Разделы">
        {([["day", "Сутки"], ["eat", "Еда"], ["me", "Я"]] as const).map(([id, ru]) => (
          <button key={id} className={tab === id ? "s-tab on" : "s-tab"} aria-current={tab === id ? "page" : undefined}
            onClick={() => { tap(); setTab(id); window.scrollTo({ top: 0 }); }}>{ru}</button>
        ))}
      </nav>
      <button className="s-ask" aria-label="Спросить коуча">?</button>
      <button className="s-fab" aria-label="Добавить">+</button>
      {restoreInput}
    </div>
  );
}
