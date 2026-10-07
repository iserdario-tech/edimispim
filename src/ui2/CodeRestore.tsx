import { useState } from "react";
import { cloudRestore, RESTORE_RU } from "../ui/cloudSync.js";
import type { StoredState } from "../ui/storage.js";

/**
 * «Восстановить по коду»: четыре слова → всё, что было. На первом экране нового телефона
 * и в «Я → Копия данных». `confirm` — когда на телефоне уже есть данные: копия их заменит.
 */
export function CodeRestore({ onDone, confirm = false }: { onDone: (s: StoredState) => void; confirm?: boolean }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const go = async () => {
    if (confirm && !window.confirm("Данные на этом телефоне заменятся копией из облака. Продолжить?")) return;
    setBusy(true); setNote("");
    const r = await cloudRestore(code);
    setBusy(false);
    if (typeof r === "string") setNote(RESTORE_RU[r]); else onDone(r);
  };
  return (
    <div className="s-restore">
      <input type="text" value={code} placeholder="например: лиса-река-гром-сыр" autoCapitalize="none" autoCorrect="off" spellCheck={false}
        aria-label="Код из четырёх слов" onChange={e => setCode(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void go(); }} />
      <button className="s-btn ghost" disabled={busy || !code.trim()} onClick={() => void go()}>{busy ? "…" : "Восстановить"}</button>
      {note && <p className="s-small">{note}</p>}
    </div>
  );
}
