import React, { useState } from "react";
import { Sheet } from "./Sheet.js";
import { BACKEND_URL } from "./notifications.js";
import { tap } from "./haptics.js";
import type { WrittenFood } from "../food/eaten.js";

/**
 * «Что ты съел?» — пишешь словами, коуч прикидывает калории и белок.
 *
 * Точного подсчёта тут не бывает: модель берёт типичную порцию, ±30% — норма. Поэтому
 * результат сначала показывается, и только по кнопке записывается: человек видит, из чего
 * сложилась цифра, и может переписать «кусок пиццы» на «два куска».
 */
export function EatSheet({ title, onClose, onSave }: {
  title: string;
  onClose: () => void;
  onSave: (food: WrittenFood) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kcal: number; protein: number; labelRU: string } | null>(null);
  const [err, setErr] = useState("");

  const estimate = async () => {
    const q = text.trim();
    if (!q || busy) return;
    tap(); setBusy(true); setErr(""); setResult(null);
    try {
      const res = await fetch(BACKEND_URL + "/estimate", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: q }),
      });
      const data = await res.json().catch(() => ({}));
      // старый воркер без /estimate отвечает 200 и не JSON — это тоже «недоступно», а не «≈ undefined»
      if (!res.ok || !Number.isFinite(data?.kcal)) setErr(data?.error ?? "Оценка сейчас недоступна. Попробуй позже.");
      else setResult(data);
    } catch {
      setErr("Нет связи — проверь интернет и попробуй ещё раз.");
    } finally { setBusy(false); }
  };

  return (
    <Sheet title={title} onClose={onClose}>
      <p className="small muted mt-0">
        Пиши как есть: «гречка с котлетой», «два куска пиццы и чай». Коуч прикинет калории и белок.
        Текст уходит только для оценки и нигде не хранится.
      </p>
      <textarea className="eat-text" rows={3} value={text} maxLength={300} autoFocus
        onChange={e => { setText(e.target.value); setResult(null); }}
        placeholder="Что съел?" aria-label="Что съел" />
      {!result && (
        <button className="chip on" disabled={busy || !text.trim()} onClick={estimate}>
          {busy ? "Считаю…" : "Оценить"}
        </button>
      )}
      {err && <p className="small note-warn">{err}</p>}
      {result && (
        <div className="eat-result">
          <b>≈ {result.kcal} ккал · белок {result.protein} г</b>
          <p className="small muted">{result.labelRU}. Это прикидка — точность около ±30%.</p>
          <div className="btn-row">
            <button className="chip on" onClick={() => { tap(); onSave({ text: text.trim(), kcal: result.kcal, protein: result.protein }); onClose(); }}>
              Записать
            </button>
            <button className="linkbtn" onClick={() => setResult(null)}>поправить текст</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
