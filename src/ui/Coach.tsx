import React, { useEffect, useRef, useState } from "react";
import { BACKEND_URL } from "./notifications.js";
import { IconSend } from "./Icons.js";
import { tap } from "./haptics.js";

interface Turn { role: "user" | "assistant"; content: string }

const HINTS = ["Почему я разбитый?", "Как продержаться сегодня?", "Спал 5 часов — что делать?"];
const KEY = "edimispim.coach.v1";
const loadTurns = (): Turn[] => {
  // в хранилище может лежать что угодно: одного `JSON.parse` мало — не массив уронит отрисовку
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v.filter(t => t && typeof t.content === "string") : [];
  } catch { return []; }
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
    tap();
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
    // Раздел «Вопрос» — сразу чат, без спойлера: он и открывается ради разговора.
    <div className="coach">
      <div className="coach-body">
        {turns.map((t, i) => (
          <div key={i} className={t.role === "user" ? "bubble me" : "bubble coachmsg"}>{t.content.replace(/\*\*/g, "")}</div>
        ))}
        {busy && <div className="bubble coachmsg">{streaming ? streaming.replace(/\*\*/g, "") : <span className="muted">Думаю…</span>}</div>}
        {/* цвет ошибки — из палитры приложения: захардкоженный не знал про тёмную тему */}
        {err && <div className="small" style={{ color: "var(--danger)" }}>{err}</div>}
        <div ref={endRef} />

        {/* Пустой чат — это не «ошибка отсутствия сообщений», а приглашение начать.
            Раньше подсказки жались к верху, а между ними и полем ввода зияло
            полэкрана пустоты: экран выглядел недоделанным. Теперь они стоят там,
            где человек и смотрит, — над полем, у большого пальца. */}
        {turns.length === 0 && !busy && (
          <div className="coach-empty">
            <p className="small muted">Спроси что угодно про сон, еду и режим. Например:</p>
            <div className="chips">
              {HINTS.map((h) => (
                <button key={h} className="chip" onClick={() => send(h)}>{h}</button>
              ))}
            </div>
          </div>
        )}

        <form className="coach-ask" onSubmit={(e) => { e.preventDefault(); send(draft); }}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)}
            placeholder="Напиши свой вопрос" aria-label="Вопрос коучу" />
          {/* Круглая кнопка со стрелкой вместо слова «Спросить»: так устроена отправка
              во всех системных приложениях, и подпись не отъедает ширину у поля. */}
          <button className="coach-send" type="submit" disabled={busy || !draft.trim()}
            aria-label="Спросить">
            <IconSend />
          </button>
        </form>
        {turns.length > 0 && (
          <button className="linkbtn small" onClick={() => { setTurns([]); setErr(""); }}>Очистить переписку</button>
        )}
      </div>
    </div>
  );
}
