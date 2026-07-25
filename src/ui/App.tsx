import React, { useRef, useState } from "react";
import type { Profile, ScreenerResult, DayLog } from "../index.js";
import { Onboarding } from "./Onboarding.js";
import { Today } from "./Today.js";
import { loadState, saveState, exportAll, importAll, type StoredState } from "./storage.js";
import { syncPushContext } from "./notifications.js";

export function App() {
  const [state, setState] = useState<StoredState | null>(() => loadState());
  const [editing, setEditing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const saveLog = (log: DayLog) => {
    setState((prev) => {
      if (!prev) return prev;
      const history = [...prev.history.filter((h) => h.date !== log.date), log].slice(-30);
      const next = { ...prev, history };
      saveState(next);
      return next;
    });
  };

  const backup = () => {
    const url = URL.createObjectURL(new Blob([exportAll()], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = `pospat-копия-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(url);
  };
  const restore = async (file: File) => {
    const restored = importAll(await file.text());
    if (!restored) { alert("Не похоже на копию pospat. Файл не подошёл."); return; }
    saveState(restored); setState(restored);
    void syncPushContext(restored.profile);
    alert("Данные восстановлены ✓");
  };

  if (!state || editing) {
    return <Onboarding initial={state?.profile} onDone={(profile: Profile, screener: ScreenerResult) => {
      const s: StoredState = { profile, history: state?.history ?? [], screener };
      saveState(s); setState(s); setEditing(false);
      void syncPushContext(profile); // иначе пуши остались бы по старым настройкам
    }} />;
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
      <div className="wrap" style={{ paddingBottom: 0, display: "flex", gap: 16, flexWrap: "wrap" }}>
        <button className="linkbtn" onClick={() => setEditing(true)}>⚙︎ Изменить настройки</button>
        <button className="linkbtn" onClick={backup}>💾 Сохранить копию</button>
        <button className="linkbtn" onClick={() => fileRef.current?.click()}>📂 Загрузить копию</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = ""; }} />
      </div>
      <Today profile={state.profile} history={state.history} screener={state.screener} onLog={saveLog} />
    </>
  );
}
