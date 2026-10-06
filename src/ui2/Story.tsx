import React, { useState } from "react";
import { createPortal } from "react-dom";
import type { Slide } from "../weekStory.js";
import { shareText } from "../ui/share.js";
import { tap } from "../ui/haptics.js";

const DOW = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

/**
 * История недели — полноэкранные слайды, как отчёты Oura и WHOOP.
 * Тап по правой половине — дальше, по левой — назад. «Поделиться» отдаёт картинку слайда
 * (через системное меню), а если телефон не умеет делиться файлами — текст.
 */
export function Story({ slides, label, onClose }: { slides: Slide[]; label: string; onClose: () => void }) {
  const [i, setI] = useState(0);
  const s = slides[i]!;
  const next = () => { tap(); if (i < slides.length - 1) setI(i + 1); else onClose(); };
  const prev = () => { tap(); if (i > 0) setI(i - 1); };

  return createPortal(
    <div className="s-story" role="dialog" aria-label={`История недели: ${s.title}`}>
      <div className="s-story-bars">
        {slides.map((_, k) => <span key={k} className={k <= i ? "on" : ""} />)}
      </div>
      <div className="s-story-top">
        <span>{label}</span>
        <button aria-label="Закрыть" onClick={onClose}>✕</button>
      </div>
      <div className="s-story-tap" onClick={e => (e.clientX > window.innerWidth / 3 ? next() : prev())}>
        <div className="s-story-title">{s.title}</div>
        <div className="s-story-big">{s.big}</div>
        <div className="s-story-sub">{s.sub}</div>
        {s.bars && (
          <div className="s-story-cols">
            {s.bars.map((v, k) => (
              <div key={k} className="s-story-col">
                <span style={{ height: `${Math.max(4, v * 100)}%`, opacity: v ? 0.9 : 0.25 }} />
                <i>{DOW[k]}</i>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="s-story-actions">
        <button className="s-btn ghost" onClick={() => void shareSlide(s, label)}>Поделиться</button>
        <button className="s-btn" onClick={next}>{i < slides.length - 1 ? "Дальше →" : "Готово"}</button>
      </div>
    </div>,
    document.body,
  );
}

/** Картинка слайда для чата: canvas 1080×1350, если телефон умеет делиться файлами; иначе текст. */
async function shareSlide(s: Slide, label: string): Promise<void> {
  const text = `${label}\n${s.title}: ${s.big}\n${s.sub}\n— edim & spim`;
  try {
    const c = document.createElement("canvas");
    c.width = 1080; c.height = 1350;
    const g = c.getContext("2d")!;
    const grad = g.createLinearGradient(0, 0, 0, c.height);
    grad.addColorStop(0, "#2A2F5C"); grad.addColorStop(0.55, "#5B4BE0"); grad.addColorStop(1, "#FFB48A");
    g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "#E3E6FA"; g.font = "500 44px -apple-system, system-ui, sans-serif"; g.fillText(label, 80, 140);
    g.fillStyle = "#FFFFFF"; g.font = "600 64px -apple-system, system-ui, sans-serif"; g.fillText(s.title, 80, 360);
    g.font = "700 150px -apple-system, system-ui, sans-serif"; g.fillText(s.big, 80, 540);
    g.font = "400 46px -apple-system, system-ui, sans-serif";
    wrap(g, s.sub, 80, 640, 920, 60);
    g.font = "500 40px -apple-system, system-ui, sans-serif"; g.fillText("edim & spim", 80, 1270);
    const blob: Blob | null = await new Promise(res => c.toBlob(res, "image/png"));
    const file = blob ? new File([blob], "edim-spim-week.png", { type: "image/png" }) : null;
    if (file && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: label }); return; }
  } catch { /* отменили или не умеет — ниже текст */ }
  await shareText(label, text);
}

function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number) {
  let line = "";
  for (const w of text.split(" ")) {
    const t = line ? `${line} ${w}` : w;
    if (g.measureText(t).width > max && line) { g.fillText(line, x, y); line = w; y += lh; } else line = t;
  }
  if (line) g.fillText(line, x, y);
}
