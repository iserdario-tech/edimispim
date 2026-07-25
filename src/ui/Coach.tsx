import React, { useEffect, useRef, useState } from "react";
import { BACKEND_URL } from "./notifications.js";

interface Turn { role: "user" | "assistant"; content: string }

const HINTS = ["Почему я разбитый?", "Как продержаться сегодня?", "Спал 5 часов — что делать?"];
const KEY = "pospat.coach.v1";
const loadTurns = (): Turn[] => {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
};

export function Coach({ contextRU }: { contextRU: string }) {
  const [turns, setTurns] = useState<Turn[]>(loadTurns);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState("");   // текст, который сейчас «печатается»
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(turns.slice(-12))); } catch { /* ignore */ } }, [turns]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [turns, streaming]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const next: Turn[] = [...turns, { role: "user", content: q }];
    setTurns(next); setDraft(""); setErr(""); setStreaming(""); setBusy(true);
    try {
      const res = await fetch(BACKEND_URL + "/coach", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next, contextRU }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setErr((data as any).error ?? "Коуч сейчас недоступен. Попробуй позже.");
        return;
      }
      // Читаем SSE-поток Workers AI: строки `data: {"response":"..."}`, конец — `data: [DONE]`.
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "", acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try { const j = JSON.parse(payload); if (j.response) { acc += j.response; setStreaming(acc); } } catch { /* пропускаем неполную строку */ }
        }
      }
      const reply = acc.trim();
      if (reply) setTurns([...next, { role: "assistant", content: reply }]);
      else setErr("Коуч промолчал. Спроси ещё раз, пожалуйста.");
    } catch {
      setErr("Нет связи. Проверь интернет и попробуй ещё раз.");
    } finally { setStreaming(""); setBusy(false); }
  };

  return (
    <details className="coach">
      <summary>💬 Спросить совета</summary>
      <div className="coach-body">
        <p className="small muted">Спроси про сон и бодрость своими словами. Отвечает по научной базе приложения. Это не врач.</p>

        {turns.map((t, i) => (
          <div key={i} className={t.role === "user" ? "bubble me" : "bubble coachmsg"}>{t.content.replace(/\*\*/g, "")}</div>
        ))}
        {busy && <div className="bubble coachmsg">{streaming ? streaming.replace(/\*\*/g, "") : <span className="muted">Думаю…</span>}</div>}
        {err && <div className="small" style={{ color: "#f85149" }}>{err}</div>}
        <div ref={endRef} />

        {turns.length === 0 && !busy && (
          <div className="chips">
            {HINTS.map((h) => (
              <button key={h} className="chip" onClick={() => send(h)}>{h}</button>
            ))}
          </div>
        )}

        <form className="coach-ask" onSubmit={(e) => { e.preventDefault(); send(draft); }}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)}
            placeholder="Напиши свой вопрос" aria-label="Вопрос коучу" />
          <button className="chip" type="submit" disabled={busy || !draft.trim()}>Спросить</button>
        </form>
        {turns.length > 0 && (
          <button className="linkbtn small" onClick={() => { setTurns([]); setErr(""); }}>Очистить переписку</button>
        )}
      </div>
    </details>
  );
}
