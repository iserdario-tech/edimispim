import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { tap } from "./haptics.js";
import { Ico } from "../ui2/Ico.js";

/**
 * Режим готовки: один шаг на экран, крупно, с таймером из текста шага.
 *
 * У плиты телефон держат мокрыми руками и смотрят издалека: мелкий список из восьми шагов
 * в шторке не читается, а экран гаснет на самом интересном. Здесь шаг один, текст крупный,
 * экран не гаснет (Wake Lock), а «вари 20 минут» превращается в кнопку таймера.
 */
export function CookMode({ name, steps, onClose }: { name: string; steps: string[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  const step = steps[i] ?? "";
  const minutes = minutesIn(step);
  const [left, setLeft] = useState<number | null>(null);   // секунд до конца таймера
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const stop = () => { clearInterval(timer.current); setLeft(null); };
  const start = (min: number) => {
    stop(); tap();
    const end = Date.now() + min * 60_000;
    setLeft(min * 60);
    timer.current = setInterval(() => {
      const s = Math.max(0, Math.round((end - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) { clearInterval(timer.current); tap(); setTimeout(tap, 300); setTimeout(tap, 600); }
    }, 500);
  };
  useEffect(() => stop, []);
  // при смене шага таймер прошлого шага не сбрасываем: суп варится, пока человек режет зелень к следующему

  // экран не гаснет, пока режим открыт; после сворачивания замок снимается сам — просим заново
  useEffect(() => {
    let lock: { release(): Promise<void> } | null = null;
    const ask = async () => { try { lock = await (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock?.request("screen") ?? null; } catch { /* не поддерживается или нет разрешения */ } };
    const onVis = () => { if (document.visibilityState === "visible") void ask(); };
    void ask();
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); void lock?.release(); };
  }, []);

  const last = i >= steps.length - 1;
  return createPortal(
    <div className="cook-mode" role="dialog" aria-modal="true" aria-label={`Готовим: ${name}`}>
      <div className="cook-head">
        <span className="cook-title">{name}</span>
        <button className="sheet-close" onClick={onClose} aria-label="Закрыть"><Ico name="close" mono /></button>
      </div>
      <p className="cook-count">шаг {i + 1} из {steps.length}</p>
      <p className="cook-step">{step}</p>
      {minutes > 0 && left === null && (
        <button className="s-btn ghost" onClick={() => start(minutes)}>Таймер на {minutes} мин</button>
      )}
      {left !== null && (
        <div className="cook-timer" aria-live="polite">
          <b>{left === 0 ? "Готово" : fmt(left)}</b>
          <button className="linkbtn" onClick={stop}>{left === 0 ? "убрать" : "стоп"}</button>
        </div>
      )}
      <div className="cook-nav">
        <button className="s-btn ghost" disabled={i === 0} onClick={() => { tap(); setI(i - 1); }}>‹ Назад</button>
        <button className="s-btn food" onClick={() => { tap(); if (last) onClose(); else setI(i + 1); }}>{last ? "Готово" : "Дальше ›"}</button>
      </div>
    </div>,
    document.body,
  );
}

/** «вари 20 минут», «10–15 мин», «полчаса», «час» — сколько ставить на таймер; диапазон — по нижней границе. */
export function minutesIn(step: string): number {
  const m = /(\d+)(?:\s*[–-]\s*\d+)?\s*мин/i.exec(step);
  if (m) return Number(m[1]);
  if (/полчаса/i.test(step)) return 30;
  if (/(?<![а-яё])час(?![а-яё])/i.test(step)) return 60;
  return 0;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
