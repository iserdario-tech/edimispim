import React, { useEffect, useRef, useState } from "react";
import { useAppState, pickUpOldApps } from "../ui/useAppState.js";
import { QuickStart } from "../ui/QuickStart.js";
import { syncPushContext } from "../ui/notifications.js";
import { useNow } from "../ui/useNow.js";
import { localMinutes } from "../today-date.js";
import { skyFor, skyGradient } from "../sky.js";
import { useDarkTheme } from "./useNight.js";
import { tap } from "../ui/haptics.js";
import { Day } from "./Day.js";
import { WhySheet } from "./WhySheet.js";
import { PlusSheet } from "./PlusSheet.js";
import { Eat } from "./Eat.js";
import { Shop } from "./Shop.js";
import { useWeek } from "./useWeek.js";
import { Me, mondayOf } from "./Me.js";
import { Story } from "./Story.js";
import { weekStory } from "../weekStory.js";
import { toDayRecords } from "../ui/dayRecords.js";
import { plusDaysISO } from "../today-date.js";
import { Onboarding } from "../ui/Onboarding.js";
import { FoodSetup } from "../ui/FoodSetup.js";
import { readLS, writeLS } from "../ui/localStore.js";
import { useDay } from "./useDay.js";
import type { StoredState } from "../ui/storage.js";

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
  // класс на <html>, а не на обёртке: шторки рисуются порталом в body и должны видеть те же переменные
  useEffect(() => {
    const r = document.documentElement;
    r.classList.add("v2");
    r.classList.toggle("night", sky.night);
  }, [sky.night]);

  const restoreInput = (
    <input ref={fileRef} type="file" accept="application/json,.json" hidden
      onChange={(e) => { const f = e.target.files?.[0]; if (f) void app.actions.restore(f); e.target.value = ""; }} />
  );

  if (!app.state) {
    return <div className="v2-root">
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

  return <Main app={app} tab={tab} setTab={setTab} now={now} night={sky.night} stops={sky.stops} restoreInput={restoreInput}
    onRestore={() => fileRef.current?.click()} />;
}

/** Основной вид — отдельно, потому что хукам дня нужно уже существующее состояние. */
function Main({ app, tab, setTab, now, night, stops, restoreInput, onRestore }: {
  app: AppModel; tab: Tab2; setTab: (t: Tab2) => void; now: Date; night: boolean; stops: string[]; restoreInput: React.ReactNode;
  onRestore: () => void;
}) {
  const day = useDay(app.state as StoredState, now);
  const [why, setWhy] = useState(false);
  const [plus, setPlus] = useState(false);
  const [shop, setShop] = useState(false);
  const week = useWeek(app.state as StoredState);
  const state = app.state as StoredState;
  const [settings, setSettings] = useState<null | "sleep" | "food">(null);
  const [storyWeek, setStoryWeek] = useState<string | null>(null);
  // история прошлой недели: карточка на «Сутках» с понедельника по среду, пока не открыта
  const lastMonday = plusDaysISO(mondayOf(day.today), -7);
  const records = toDayRecords(state.history, state.weights ?? [], state.eaten ?? {}, state.cheatDays ?? []);
  const storySlides = storyWeek ? weekStory(records, storyWeek, state.profile.targetSleepMin) : null;
  const [seen, setSeen] = useState(() => readLS<string | null>("edimispim.storySeen", null));
  const dow = (new Date(day.today + "T12:00:00Z").getUTCDay() + 6) % 7;
  const offerStory = dow <= 2 && seen !== lastMonday && !!weekStory(records, lastMonday, state.profile.targetSleepMin);
  const weekLabel = (m: string) => {
    const f = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
    return `${f(m)} – ${f(plusDaysISO(m, 6))}`;
  };

  if (settings) {
    return (
      <div className="v2-root s-settings">
        <button className="s-back s-settings-back" onClick={() => setSettings(null)}>‹ Я</button>
        {settings === "sleep"
          ? <Onboarding initial={state.profile} onDone={(profile, screener) => { app.update({ ...state, profile, screener }); setSettings(null); void syncPushContext(profile); }} />
          : <FoodSetup initial={state.food} onCancel={() => setSettings(null)} onDone={food => { app.update({ ...state, food }); setSettings(null); }} />}
      </div>
    );
  }
  return (
    <div className="v2-root">
      <div className="s-sky" style={{ background: skyGradient(stops) }} />
      {tab === "day" && <Day app={app} day={day} now={now} onWhy={() => setWhy(true)}
        story={offerStory ? { label: weekLabel(lastMonday), open: () => { setStoryWeek(lastMonday); writeLS("edimispim.storySeen", lastMonday); setSeen(lastMonday); } } : undefined} />}
      {tab === "eat" && !shop && <Eat app={app} week={week} onShop={() => { setShop(true); window.scrollTo({ top: 0 }); }} onSetupFood={() => setSettings("food")} />}
      {tab === "eat" && shop && <Shop week={week} onBack={() => { setShop(false); window.scrollTo({ top: 0 }); }} />}
      {tab === "me" && <Me app={app} day={day} onSettings={setSettings} onStory={setStoryWeek} onRestore={onRestore} />}
      {storySlides && storyWeek && <Story slides={storySlides} label={`Неделя ${weekLabel(storyWeek)}`} onClose={() => setStoryWeek(null)} />}

      <nav className="s-tabbar" aria-label="Разделы">
        {([["day", "Сутки"], ["eat", "Еда"], ["me", "Я"]] as const).map(([id, ru]) => (
          <button key={id} className={tab === id ? "s-tab on" : "s-tab"} aria-current={tab === id ? "page" : undefined}
            onClick={() => { tap(); setTab(id); window.scrollTo({ top: 0 }); }}>{ru}</button>
        ))}
      </nav>
      <button className="s-ask" aria-label="Спросить коуча">?</button>
      <button className="s-fab" aria-label="Добавить" onClick={() => { tap(); setPlus(true); }}>+</button>
      {why && <WhySheet app={app} day={day} onClose={() => setWhy(false)} />}
      {plus && <PlusSheet app={app} day={day} onClose={() => setPlus(false)} />}
      {restoreInput}
    </div>
  );
}
