import React, { useEffect, useRef, useState } from "react";
import { BACKEND_URL } from "./notifications.js";
import { IconSend, IconCoachBubble } from "./Icons.js";
import { tap } from "./haptics.js";
import { useKeyboardInset } from "./useKeyboardInset.js";

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
  useKeyboardInset();   // закреплённое поле ввода должно подниматься над клавиатурой

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(turns.slice(-12))); } catch { /* ignore */ } }, [turns]);

  /**
   * Лента следует за ответом только пока человек внизу.
   *
   * Раньше прокрутка дёргалась на КАЖДЫЙ кусок ответа: `streaming` меняется десятки раз
   * в секунду, и каждый раз страницу силой тянуло вниз. Стоило отлистать вверх, чтобы
   * прочитать начало длинного ответа, — и текст выдёргивало обратно. Со стороны это
   * выглядит так, будто экран живёт своей жизнью.
   *
   * Теперь работает правило любого мессенджера: внизу — держимся низа, отлистал вверх —
   * тебя больше не трогают, пока сам не вернёшься или не отправишь вопрос.
   */
  const stick = useRef(true);
  useEffect(() => {
    const onScroll = () => {
      const gap = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
      stick.current = gap < 120;
    };
    addEventListener("scroll", onScroll, { passive: true });
    return () => removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    if (stick.current) endRef.current?.scrollIntoView({ block: "end", behavior: "auto" });
  }, [turns, streaming]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    tap();
    const next: Turn[] = [...turns, { role: "user", content: q }];
    stick.current = true;   // свой вопрос человек хочет видеть — возвращаемся к низу
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
          try {
            /*
             * Кусок ответа берём из `delta.content`, а не из `response`.
             *
             * Оба поля несут один и тот же текст, но `response` теряет форматирование на
             * числах: Cloudflare отдаёт числовой кусок JSON-числом, и ведущий пробел
             * пропадает — выходило «ложись не позже чем за7-8 часов». В `delta.content`
             * тот же кусок приходит строкой ' 7-8', с пробелом.
             *
             * Проверка на `undefined`, а не на истинность: пустая строка и ноль — обычные
             * куски ответа, а не признак его конца.
             */
            const j = JSON.parse(payload) as {
              response?: unknown;
              choices?: { delta?: { content?: unknown } }[];
            };
            const piece = j.choices?.[0]?.delta?.content ?? j.response;
            if (piece !== undefined && piece !== null) {
              acc += String(piece);
              setStreaming(acc);
            }
          } catch { /* пропускаем неполную строку */ }
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

        {/* Пустой чат — приглашение начать, а не «нет сообщений».
            Сначала подсказки жались к верху и под ними зияла треть экрана; потом я
            прижал их к полю ввода — и пустота переехала наверх. Правильно по HIG иначе:
            пустое состояние стоит В ЦЕНТРЕ свободного места, а не у одного из краёв. */}
        {turns.length === 0 && !busy && (
          <div className="coach-empty">
            <div className="coach-empty-mark" aria-hidden="true"><IconCoachBubble /></div>
            <p className="coach-empty-title">Спроси что угодно про сон, еду и режим</p>
            <p className="small muted">
              Коуч видит твой режим и меню, отвечает по научной базе и не заменяет врача.
            </p>
            <div className="chips">
              {HINTS.map((h) => (
                <button key={h} className="chip" onClick={() => send(h)}>{h}</button>
              ))}
            </div>
          </div>
        )}

        {/* Кнопка стоит НАД полем ввода: под ним лежит полоса фона, которая закрывает
            щель до панели вкладок, — и всё, что оказывалось ниже, пропадало из виду. */}
        {turns.length > 0 && (
          <div className="coach-clear">
            <button className="linkbtn small" onClick={() => { setTurns([]); setErr(""); }}>
              Очистить переписку
            </button>
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
      </div>
    </div>
  );
}
