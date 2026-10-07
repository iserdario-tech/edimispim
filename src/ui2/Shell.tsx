import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAppState, pickUpOldApps } from "../ui/useAppState.js";
import { QuickStart } from "../ui/QuickStart.js";
import { syncPushContext } from "../ui/notifications.js";
import { useNow } from "../ui/useNow.js";
import { localMinutes } from "../today-date.js";
import { skyFor, skyGlow, skyTopColor } from "../sky.js";
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
import { Install } from "./Install.js";
import { AskSheet } from "./AskSheet.js";
import { Tour, TOUR_KEY } from "./Tour.js";
import { readCloud, cloudUpload, markCodeNoted } from "../ui/cloudSync.js";
import { readPair, syncPair } from "../ui/pairSync.js";
import { localDateISO } from "../today-date.js";
import { menuOf, mergeSwaps, pairFactor } from "../pair.js";
import { targetsForToday } from "../food/index.js";
import { targetsFor } from "../ui/storage.js";
import { isIOS, isStandalone } from "../ui/dataSafety.js";
import { unmarkedToday } from "../streak2.js";
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
    // полоса под часами — того же цвета, что верх экрана: на «Сутках» это свечение, на остальных — фон
    const top = tab === "day" ? skyTopColor(sky.glow, sky.night) : sky.night ? "#000000" : "#F2F2F7";
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute("content", top));
  }, [sky.night, sky.glow, tab]);

  const restoreInput = (
    <input ref={fileRef} type="file" accept="application/json,.json" hidden
      onChange={(e) => { const f = e.target.files?.[0]; if (f) void app.actions.restore(f); e.target.value = ""; }} />
  );

  const [installSkipped, setInstallSkipped] = useState(() => readLS<boolean>("edimispim.installSkip", false));
  if (!app.state && isIOS() && !isStandalone() && !installSkipped) {
    return <div className="v2-root">
      <div className="s-sky" />
      <Install onContinue={() => { writeLS("edimispim.installSkip", true); setInstallSkipped(true); }}
        onRestore={() => fileRef.current?.click()} />
      {restoreInput}
    </div>;
  }
  if (!app.state) {
    return <div className="v2-root">
      <div className="s-sky" />
      <QuickStart onRestore={() => fileRef.current?.click()}
        onCloudRestored={(s) => { app.update(s); void syncPushContext(s.profile); }}
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

  return <Main app={app} tab={tab} setTab={setTab} now={now} glow={skyGlow(sky.glow, sky.night)} restoreInput={restoreInput}
    onRestore={() => fileRef.current?.click()} />;
}

/** Основной вид — отдельно, потому что хукам дня нужно уже существующее состояние. */
function Main({ app, tab, setTab, now, glow, restoreInput, onRestore }: {
  app: AppModel; tab: Tab2; setTab: (t: Tab2) => void; now: Date; glow: string; restoreInput: React.ReactNode;
  onRestore: () => void;
}) {
  /*
   * «Готовим вдвоём». Экраны получают состояние, где меню партнёра «b» — меню пары,
   * а «на сколько готовить» — моя порция плюс порция партнёра по его калориям.
   * Записи (отметки, замены) по-прежнему идут в настоящее состояние через app.actions.
   */
  const [pair, setPair] = useState(readPair);
  const real = app.state as StoredState;
  const pairState = useMemo((): StoredState => {
    if (!pair || !real.food) return real;
    const food = real.food;
    const kcal = targetsForToday(targetsFor(food), food.startISO, localDateISO(), food.pace).targets.kcalTarget;
    return {
      ...real,
      swaps: pair.role === "b" ? mergeSwaps(pair.menu, real.swaps) : real.swaps,
      food: { ...food, household: pairFactor(kcal, pair.otherKcal) },
    };
  }, [real, pair]);
  const view = useMemo(() => ({ ...app, state: pairState }), [app, pairState]);
  const day = useDay(pairState, now);
  const [why, setWhy] = useState(false);
  // копия в облаке: при открытии и при сворачивании (сама не чаще раза в 3 часа)
  const [cloud, setCloud] = useState(readCloud);
  useEffect(() => {
    const go = () => void cloudUpload().then(c => c && setCloud(c));
    const onHide = () => { if (document.visibilityState === "hidden") go(); };
    go();
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);
  // пуш «как спалось?» открывает сразу отметку ночи, «#eat» — шторку «+»
  const [plus, setPlus] = useState<false | "any" | "night">(() =>
    location.hash === "#night" || location.hash === "#mark" ? "night" : location.hash === "#eat" ? "any" : false);
  const [ask, setAsk] = useState(false);
  // пуш, нажатый при открытом приложении, меняет только хеш — без перезагрузки
  useEffect(() => {
    const on = () => {
      if (location.hash === "#night" || location.hash === "#mark") setPlus("night");
      else if (location.hash === "#eat") setPlus("any");
    };
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  const [shop, setShop] = useState(false);
  const week = useWeek(pairState);
  // обмен с партнёром: при открытии и при возвращении в приложение
  useEffect(() => {
    const go = () => {
      if (!readPair() || !real.food) return;
      const food = real.food;
      void syncPair({
        kcal: targetsForToday(targetsFor(food), food.startISO, localDateISO(), food.pace).targets.kcalTarget,
        ...(week.plan && readPair()?.role === "a" ? { menu: menuOf(week.plan.days) } : {}),
        pantry: week.pantry, setPantry: week.setPantryQuiet,
      }).then(p => p && setPair(p));
    };
    go();
    const onShow = () => { if (document.visibilityState === "visible") go(); };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
    // ponytail: меню владельца уходит при открытии/возвращении, а не на каждую замену — партнёр
    // увидит замену при следующем открытии, и KV не тратит запись на каждый тап
  }, [pair?.code, week.plan]);
  const state = app.state as StoredState;
  const [settings, setSettings] = useState<null | "sleep" | "food">(null);
  const [storyWeek, setStoryWeek] = useState<string | null>(null);
  // тур один раз для всех, включая тех, кто пользовался 1.x: 2.0 устроена иначе
  const [tour, setTour] = useState(() => !readLS<boolean>(TOUR_KEY, false));
  const closeTour = () => { writeLS(TOUR_KEY, true); setTour(false); };
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

  // цифра на иконке: сколько приёмов сегодня не отмечено (iOS 16.4+, только на экране «Домой»)
  const badge = unmarkedToday(day.foodDay?.day ?? null, day.eaten);
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    try { void (badge > 0 ? nav.setAppBadge?.(badge) : nav.clearAppBadge?.())?.catch(() => {}); } catch { /* не умеет — и ладно */ }
  }, [badge]);

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
      {/* свечение неба — только на «Сутках», остальные экраны однотонные */}
      <div className="s-sky" style={tab === "day" ? { backgroundImage: glow } : undefined} />
      {tab === "day" && <Day app={view} day={day} now={now} onWhy={() => setWhy(true)}
        code={cloud?.at && !cloud.noted ? { code: cloud.code, onNoted: () => { markCodeNoted(); setCloud(readCloud()); } } : undefined}
        story={offerStory ? { label: weekLabel(lastMonday), open: () => { setStoryWeek(lastMonday); writeLS("edimispim.storySeen", lastMonday); setSeen(lastMonday); } } : undefined} />}
      {tab === "eat" && !shop && <Eat app={view} week={week} pair={pair} onShop={() => { setShop(true); window.scrollTo({ top: 0 }); }} onSetupFood={() => setSettings("food")} />}
      {tab === "eat" && shop && <Shop week={week} onBack={() => { setShop(false); window.scrollTo({ top: 0 }); }} />}
      {tab === "me" && <Me app={view} day={day} cloud={cloud} onCloud={setCloud} pair={pair} onPair={setPair} onSettings={setSettings} onStory={setStoryWeek} onRestore={onRestore} onTour={() => setTour(true)} />}
      {tour && <Tour onClose={closeTour} />}
      {storySlides && storyWeek && <Story slides={storySlides} label={`Неделя ${weekLabel(storyWeek)}`} onClose={() => setStoryWeek(null)} />}

      <nav className="s-tabbar" aria-label="Разделы">
        {([["day", "Сутки"], ["eat", "Еда"], ["me", "Я"]] as const).map(([id, ru]) => (
          <button key={id} className={tab === id ? "s-tab on" : "s-tab"} aria-current={tab === id ? "page" : undefined}
            onClick={() => { tap(); setTab(id); window.scrollTo({ top: 0 }); }}>{ru}</button>
        ))}
        <button className="s-tab-ask" aria-label="Спросить коуча" onClick={() => { tap(); setAsk(true); }}>?</button>
      </nav>
      <button className="s-fab" aria-label="Добавить" onClick={() => { tap(); setPlus("any"); }}>+</button>
      {why && <WhySheet app={view} day={day} onClose={() => setWhy(false)} />}
      {plus && <PlusSheet app={view} day={day} initial={plus === "night" ? "night" : null} onClose={() => { setPlus(false); if (location.hash) history.replaceState(null, "", location.pathname + location.search); }} />}
      {ask && <AskSheet state={state} screen={tab} onClose={() => setAsk(false)} />}
      {restoreInput}
    </div>
  );
}

/** Событие из main.tsx: новая версия скачана, а открыт ещё старый код. */
export const UPDATE_EVENT = "edimispim:update";

/** Плашка сверху «Вышла новая версия · Обновить» — иначе люди неделями сидят на старой. */
export function UpdateBanner() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const on = () => setReady(true);
    window.addEventListener(UPDATE_EVENT, on);
    return () => window.removeEventListener(UPDATE_EVENT, on);
  }, []);
  if (!ready) return null;
  return (
    <div className="s-update" role="status">
      <span>Вышла новая версия</span>
      <button onClick={() => location.reload()}>Обновить</button>
    </div>
  );
}
