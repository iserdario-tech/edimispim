import React, { useEffect, useRef, useState } from "react";
import type { Profile, ScreenerResult, DayLog } from "../index.js";
import { Onboarding } from "./Onboarding.js";
import { Today } from "./Today.js";
import { Week } from "./Week.js";
import { Profile as ProfileScreen } from "./Profile.js";
import { FoodSetup } from "./FoodSetup.js";
import { Coach } from "./Coach.js";
import { Nav, type Tab } from "./Nav.js";
import { useSwipeBack } from "./useSwipeBack.js";
import { ScreenHeader } from "./ScreenHeader.js";
import { loadState, saveState, exportAll, importAll, type FoodSettings, type StoredState } from "./storage.js";
import { syncPushContext } from "./notifications.js";
import { migrateAll } from "../migrate.js";
import { localDateISO } from "../today-date.js";
import { toggleMark, type MealMark } from "../food/eaten.js";
import type { Slot } from "../food/types.js";

/** Данные из pospat и oheedet лежат на том же origin — подхватываем их, а не просим вводить заново. */
function pickUpOldApps(): { food?: FoodSettings; weights: { date: string; kg: number }[]; notesRU: string[] } {
  if (typeof localStorage === "undefined") return { weights: [], notesRU: [] };
  const m = migrateAll(localStorage);
  const weights = m.days.flatMap(d =>
    typeof d.body?.weightKg === "number" ? [{ date: d.date, kg: d.body.weightKg }] : []);
  const food: FoodSettings | undefined = m.foodProfile
    ? { profile: m.foodProfile, constraints: m.constraints ?? {}, mealCount: 4 }
    : undefined;
  return { food, weights, notesRU: m.notesRU };
}

export function App() {
  const [state, setState] = useState<StoredState | null>(() => loadState());
  const [tab, setTab] = useState<Tab>("today");
  const [editing, setEditing] = useState(false);
  const [editingFood, setEditingFood] = useState(false);
  // откуда пришли на вложенный экран — туда и вернём, а не на первый раздел
  const [returnTab, setReturnTab] = useState<Tab>("today");
  const [migrationNote, setMigrationNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state) return;
    const picked = pickUpOldApps();
    if (picked.weights.length || picked.food) setMigrationNote(picked.notesRU.join(" "));
  }, [state]);

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

  const update = (next: StoredState) => { saveState(next); setState(next); };

  const saveLog = (log: DayLog) => {
    setState((prev) => {
      if (!prev) return prev;
      const history = [...prev.history.filter((h) => h.date !== log.date), log].slice(-180);
      const next = { ...prev, history };
      saveState(next);
      return next;
    });
  };

  /**
   * Отметка «съел» / «заменил своим». Хранится не больше 180 дней — ровно как история сна:
   * ряд нужен месяцами для разбора плато, но копить его вечно незачем.
   */
  const markMeal = (date: string, slot: Slot, mark: MealMark, planned: number) => {
    setState((prev) => {
      if (!prev) return prev;
      const all = { ...(prev.eaten ?? {}) };
      all[date] = toggleMark(all[date], slot, mark, planned);
      const kept = Object.keys(all).sort().slice(-180);
      const eaten = Object.fromEntries(kept.map(d => [d, all[d]!]));
      const next = { ...prev, eaten };
      saveState(next);
      return next;
    });
  };

  const addWeight = (kg: number) => {
    setState((prev) => {
      if (!prev) return prev;
      const date = localDateISO();
      const weights = [...(prev.weights ?? []).filter(w => w.date !== date), { date, kg }]
        .sort((a, b) => a.date.localeCompare(b.date));
      const next = { ...prev, weights };
      saveState(next);
      return next;
    });
  };

  const backup = () => {
    const url = URL.createObjectURL(new Blob([exportAll()], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = `едим-и-спим-копия-${localDateISO()}.json`;
    a.click(); URL.revokeObjectURL(url);
  };
  const restore = async (file: File) => {
    const restored = importAll(await file.text());
    if (!restored) { alert("Не похоже на копию «едим и спим». Файл не подошёл."); return; }
    update(restored);
    void syncPushContext(restored.profile);
    alert("Данные восстановлены ✓");
  };

  // свайп от левого края закрывает вложенный экран — до кнопки в углу одной рукой не дотянуться

  useSwipeBack(!!state && (editing || editingFood), back);


  if (!state || editing) {
    return <>
      {state && <ScreenHeader title="Сон" onBack={back} />}
      <Onboarding initial={state?.profile} onDone={(profile: Profile, screener: ScreenerResult) => {
      const picked = state ? { food: state.food, weights: state.weights ?? [] } : pickUpOldApps();
      const food = state?.food ?? picked.food;
      const weights = state?.weights ?? picked.weights;
      update({
        profile,
        history: state?.history ?? [],
        screener,
        ...(food ? { food } : {}),
        ...(weights.length ? { weights } : {}),
      });
      setEditing(false);
      setTab(returnTab);
      void syncPushContext(profile);
    }} />
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
      {migrationNote && tab === "today" && (
        <div className="wrap" style={{ paddingBottom: 0 }}>
          <p className="muted small">📦 {migrationNote}</p>
        </div>
      )}

      {tab === "today" && (
        <Today
          profile={state.profile} history={state.history} screener={state.screener}
          onLog={saveLog} food={state.food} weights={state.weights}
          eaten={state.eaten} onMarkMeal={markMeal}
          onSetupFood={() => openOverlay("food")}
        />
      )}
      {tab === "week" && (
        <Week
          profile={state.profile} history={state.history} food={state.food}
          weights={state.weights} eaten={state.eaten} onAddWeight={addWeight}
          onSetupFood={() => openOverlay("food")}
        />
      )}
      {tab === "coach" && (
        <main className="wrap chat-screen">
          <p className="small muted">
            Отвечает по научной базе о сне и питании и видит, как у тебя дела сейчас.
            Не заменяет врача.
          </p>
          <Coach contextRU={coachContext(state)} />
        </main>
      )}
      {tab === "profile" && (
        <ProfileScreen
          food={state.food} screener={state.screener}
          onEditSleep={() => openOverlay("sleep")}
          onEditFood={() => openOverlay("food")}
          onBackup={backup} onRestore={restore}
        />
      )}

      <input ref={fileRef} type="file" accept="application/json,.json" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = ""; }} />
      <Nav tab={tab} onChange={setTab} />
    </>
  );
}

/** Короткая сводка «как дела сейчас» — чтобы коуч отвечал про этого человека, а не вообще. */
function coachContext(state: StoredState): string {
  const last = state.history[state.history.length - 1];
  const weights = state.weights ?? [];
  return [
    // Просьба про стиль идёт в контексте, потому что сам промпт живёт на Worker'е,
    // а он пока задеплоен старой версии — так подробные ответы работают уже сейчас.
    "СТИЛЬ ОТВЕТА: отвечай развёрнуто — 4–8 предложений. Сначала объясни причину простыми словами, потом дай 2–4 конкретных шага. Не ограничивайся одной фразой.",
    "Приложение объединяет сон и питание: можешь отвечать и про еду, и про режим дня.",
    `Обычный подъём: ${state.profile.anchorWakeHM}. Цель сна: ${(state.profile.targetSleepMin / 60).toFixed(1)} ч.`,
    last ? `Последняя отмеченная ночь ${last.date}: подъём ${last.wokeHM}, качество ${last.quality}/5${last.hadAlcohol ? ", был алкоголь" : ""}.` : "Ночи пока не отмечались.",
    state.food ? `Питание настроено: ${state.food.mealCount} приёма в день.` : "Питание пока не настроено.",
    weights.length >= 2
      ? `Вес: с ${weights[0]!.kg} до ${weights[weights.length - 1]!.kg} кг за ${weights.length} замеров.`
      : "",
    state.screener?.flagged
      ? `ВАЖНО, анкета показала признаки, требующие врача: ${state.screener.messagesRU.join(" ")}`
      : "",
  ].filter(Boolean).join("\n");
}
