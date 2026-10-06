import React, { useEffect, useRef, useState } from "react";
import type { Profile, ScreenerResult } from "../index.js";
import { Onboarding } from "./Onboarding.js";
import { QuickStart } from "./QuickStart.js";
import { useAppState, pickUpOldApps, coachContext } from "./useAppState.js";
import { Today } from "./Today.js";
import { Food } from "./Food.js";
import { Progress } from "./Progress.js";
import { Profile as ProfileScreen } from "./Profile.js";
import { FoodSetup } from "./FoodSetup.js";
import { Coach } from "./Coach.js";
import { Nav, type Tab } from "./Nav.js";
import { useSwipeBack } from "./useSwipeBack.js";
import { ScreenHeader } from "./ScreenHeader.js";
import { syncPushContext } from "./notifications.js";

export function App() {
  const { state, update, saveFailed, backupAt, migrationNote, actions } = useAppState();
  const {
    saveLog, markMeal, markAll, ownSize, ownWritten, extraAdd, extraRemove, rateDish, setCheatDay,
    adjustKcal, markTuned, setNoCook, saveSwap, addWeight, backup, restore,
  } = actions;
  const [tab, setTab] = useState<Tab>("today");
  const [editing, setEditing] = useState(false);
  const [editingFood, setEditingFood] = useState(false);
  // откуда пришли на вложенный экран — туда и вернём, а не на первый раздел
  const [returnTab, setReturnTab] = useState<Tab>("today");
  const fileRef = useRef<HTMLInputElement>(null);


  const overlay = editing || editingFood;
  const closeOverlay = () => { setEditing(false); setEditingFood(false); };

  const openOverlay = (which: "sleep" | "food") => {
    setReturnTab(tab);
    if (which === "sleep") setEditing(true); else setEditingFood(true);
    // отдельная запись в истории: системная «назад» и свайп закроют экран,
    // а не выбросят человека из приложения
    history.pushState({ overlay: which }, "");
  };

  useEffect(() => {
    const onPop = () => closeOverlay();
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  const back = () => {
    closeOverlay();
    setTab(returnTab);
    if (history.state?.overlay) history.back();
  };


  // свайп от левого края закрывает вложенный экран — до кнопки в углу одной рукой не дотянуться

  useSwipeBack(!!state && (editing || editingFood), back);


  // Новый человек — быстрый старт: три шага и сразу день с едой. Полная форма сна
  // осталась для правки из «Я».
  if (!state) {
    return <>
      <QuickStart onRestore={() => fileRef.current?.click()}
        onDone={(profile, screener, quickFood) => {
          const picked = pickUpOldApps();
          // перенесённое из oheedet полнее быстрого старта: там уже есть ограничения и скрининг
          const food = picked.food ?? quickFood;
          update({
            profile, history: picked.history, screener, food,
            ...(picked.weights.length ? { weights: picked.weights } : {}),
          });
          setTab("today");
          void syncPushContext(profile);
        }} />
      <input ref={fileRef} type="file" accept="application/json,.json" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = ""; }} />
    </>;
  }

  if (editing) {
    return <>
      <ScreenHeader title="Сон" onBack={back} />
      <Onboarding initial={state?.profile} onRestore={() => fileRef.current?.click()}
        onDone={(profile: Profile, screener: ScreenerResult) => {
      const picked = state
        ? { food: state.food, weights: state.weights ?? [], history: state.history }
        : pickUpOldApps();
      const food = state?.food ?? picked.food;
      const weights = state?.weights ?? picked.weights;
      update({
        profile,
        history: state?.history ?? picked.history,   // ночи из pospat, а не пустой массив
        screener,
        ...(food ? { food } : {}),
        ...(weights.length ? { weights } : {}),
      });
      setEditing(false);
      setTab(returnTab);
      void syncPushContext(profile);
    }} />
      {/* Поле выбора файла нужно и здесь: основное живёт в ветке с готовым состоянием,
          а «Загрузить копию» на онбординге как раз для тех, у кого состояния ещё нет. */}
      <input ref={fileRef} type="file" accept="application/json,.json" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = ""; }} />
    </>;
  }

  if (editingFood) {
    return <>
      <ScreenHeader title="Еда" onBack={back} />
      <FoodSetup initial={state.food} onCancel={back}
        onDone={(food) => { update({ ...state, food }); closeOverlay(); setTab(returnTab); }} />
    </>;
  }

  return (
    <>
      {saveFailed && (
        <div className="wrap wrap-flush">
          <p className="note-warn small">
            Не удалось сохранить данные на этом устройстве: закончилось место или браузер
            работает в приватном режиме. Всё, что видно на экране, пропадёт при перезапуске —
            сделай копию через «Профиль → Сохранить копию».
          </p>
        </div>
      )}
      {migrationNote && tab === "today" && (
        <div className="wrap wrap-flush">
          <p className="muted small">📦 {migrationNote}</p>
        </div>
      )}

      {tab === "today" && (
        <Today
          profile={state.profile} history={state.history} screener={state.screener}
          onLog={saveLog} food={state.food} weights={state.weights}
          eaten={state.eaten} ratings={state.ratings} cheatDays={state.cheatDays}
          swaps={state.swaps}
          onMarkMeal={markMeal} onCheatDay={setCheatDay}
          onMarkAll={markAll} onOwnSize={ownSize}
          onOwnWritten={ownWritten} onExtraAdd={extraAdd} onExtraRemove={extraRemove}
          noCookDays={state.noCookDays} onNoCook={setNoCook}
          onTuned={markTuned}
          onSetupFood={() => openOverlay("food")}
          backupAt={backupAt} onBackup={backup}
        />
      )}
      {tab === "food" && (
        <Food
          profile={state.profile} food={state.food}
          ratings={state.ratings} onRate={rateDish}
          swaps={state.swaps} onSwap={saveSwap}
          onSetupFood={() => openOverlay("food")}
          noCookDays={state.noCookDays}
        />
      )}
      {tab === "progress" && (
        <Progress
          profile={state.profile} history={state.history} food={state.food}
          weights={state.weights} eaten={state.eaten} cheatDays={state.cheatDays}
          onAddWeight={addWeight} onAdjustKcal={adjustKcal}
        />
      )}
      {tab === "coach" && (
        <main className="wrap chat-screen">
          {/* Заголовок такой же, как на остальных вкладках: раздел без Large Title
              выпадал из системы и читался как чужой экран внутри приложения. */}
          <h1 className="page-title">
            Вопрос
            <span className="page-sub">отвечает по научной базе, видит твои дела и не заменяет врача</span>
          </h1>
          <Coach contextRU={coachContext(state)} />
        </main>
      )}
      {tab === "profile" && (
        <ProfileScreen
          food={state.food} screener={state.screener}
          ratings={state.ratings} onRate={rateDish}
          onEditSleep={() => openOverlay("sleep")}
          onEditFood={() => openOverlay("food")}
          onBackup={backup} onRestore={restore}
        />
      )}

      <input ref={fileRef} type="file" accept="application/json,.json" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = ""; }} />
      {/* Смена вкладки показывает раздел с начала. Без этого страница удерживала прежнюю
          прокрутку: с середины «Еды» человек попадал в середину «Итогов» и видел не заголовок,
          а обрывок карточки. Разделы независимы — общей позиции у них быть не может. */}
      <Nav tab={tab} onChange={(t) => { setTab(t); window.scrollTo({ top: 0 }); }} />
    </>
  );
}

