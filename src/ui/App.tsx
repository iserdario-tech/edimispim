import React, { useEffect, useRef, useState } from "react";
import type { Profile, ScreenerResult, DayLog } from "../index.js";
import { Onboarding } from "./Onboarding.js";
import { Today } from "./Today.js";
import { FoodSetup } from "./FoodSetup.js";
import { loadState, saveState, exportAll, importAll, type FoodSettings, type StoredState } from "./storage.js";
import { syncPushContext } from "./notifications.js";
import { migrateAll } from "../migrate.js";

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
  const [editing, setEditing] = useState(false);
  const [editingFood, setEditingFood] = useState(false);
  const [migrationNote, setMigrationNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // При первом запуске забираем историю сна, вес и профиль питания из старых приложений.
  useEffect(() => {
    if (state) return;
    const picked = pickUpOldApps();
    if (picked.weights.length || picked.food) setMigrationNote(picked.notesRU.join(" "));
  }, [state]);

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

  const backup = () => {
    const url = URL.createObjectURL(new Blob([exportAll()], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = `едим-и-спим-копия-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(url);
  };
  const restore = async (file: File) => {
    const restored = importAll(await file.text());
    if (!restored) { alert("Не похоже на копию «едим и спим». Файл не подошёл."); return; }
    update(restored);
    void syncPushContext(restored.profile);
    alert("Данные восстановлены ✓");
  };

  if (!state || editing) {
    return <Onboarding initial={state?.profile} onDone={(profile: Profile, screener: ScreenerResult) => {
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
      void syncPushContext(profile); // иначе пуши остались бы по старым настройкам
    }} />;
  }

  if (editingFood) {
    return <FoodSetup initial={state.food} onCancel={() => setEditingFood(false)}
      onDone={(food) => { update({ ...state, food }); setEditingFood(false); }} />;
  }

  return (
    <>
      {state.screener?.flagged && (
        <div className="wrap" style={{ paddingBottom: 0 }}>
          <div className="flagbox">
            <strong>Важно</strong>
            <ul>{state.screener.messagesRU.map((m, i) => <li key={i}>{m}</li>)}</ul>
          </div>
        </div>
      )}
      {migrationNote && (
        <div className="wrap" style={{ paddingBottom: 0 }}>
          <p className="muted small">📦 {migrationNote}</p>
        </div>
      )}
      <div className="wrap" style={{ paddingBottom: 0, display: "flex", gap: 16, flexWrap: "wrap" }}>
        <button className="linkbtn" onClick={() => setEditing(true)}>⚙︎ Сон</button>
        <button className="linkbtn" onClick={() => setEditingFood(true)}>🍽️ Еда</button>
        <button className="linkbtn" onClick={backup}>💾 Сохранить копию</button>
        <button className="linkbtn" onClick={() => fileRef.current?.click()}>📂 Загрузить копию</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = ""; }} />
      </div>
      <Today
        profile={state.profile}
        history={state.history}
        screener={state.screener}
        onLog={saveLog}
        food={state.food}
        weights={state.weights}
        onSetupFood={() => setEditingFood(true)}
      />
    </>
  );
}
