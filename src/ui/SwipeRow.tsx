import React, { useRef, useState } from "react";

/**
 * Строка, которую можно смахнуть: влево — «съел», вправо — «своё».
 *
 * Кнопки под блюдом остаются — свайп лишь быстрый путь, а не единственный: его не видно,
 * пока не знаешь, и мышью на компьютере им не воспользоваться.
 *
 * Горизонтальный жест ловим сами (`touch-action: pan-y` отдаёт браузеру только вертикаль),
 * а если палец пошёл скорее вниз, чем вбок, — отпускаем: лента должна листаться как обычно.
 */
const THRESHOLD = 72;   // px — примерно ширина подписи, которую человек видит под пальцем
const LIMIT = 120;

export function SwipeRow({ onLeft, onRight, leftLabel, rightLabel, enabled = true, children }: {
  onLeft: () => void;
  onRight: () => void;
  /** Подпись, которая проступает при смахивании влево. */
  leftLabel: string;
  rightLabel: string;
  enabled?: boolean;
  children: React.ReactNode;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const [dx, setDx] = useState(0);
  if (!enabled) return <>{children}</>;

  const reset = () => { start.current = null; setDx(0); };
  return (
    <div className="swipe">
      {/* подписи — только пока ведёшь пальцем: у прошедших строк карточка полупрозрачная,
          и постоянные подписи просвечивали бы сквозь неё */}
      {dx !== 0 && (
        <div className="swipe-under" aria-hidden="true">
          <span className={dx > 0 ? "swipe-label on own" : "swipe-label own"}>{rightLabel}</span>
          <span className={dx < 0 ? "swipe-label on ate" : "swipe-label ate"}>{leftLabel}</span>
        </div>
      )}
      <div className="swipe-over"
        // пока палец ведёт — без анимации, иначе строка отстаёт от пальца
        style={dx ? { transform: `translateX(${dx}px)`, transition: "none" } : undefined}
        onPointerDown={e => {
          if (e.pointerType === "mouse") return;
          start.current = { x: e.clientX, y: e.clientY };
          // палец может уйти за край строки — отпускание всё равно придёт сюда, иначе строка зависала сдвинутой
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* синтетические события */ }
        }}
        onPointerMove={e => {
          const s = start.current;
          if (!s) return;
          const x = e.clientX - s.x, y = e.clientY - s.y;
          // пошёл вниз — это прокрутка ленты, не наш жест
          if (!dx && Math.abs(y) > Math.abs(x)) { start.current = null; return; }
          setDx(Math.max(-LIMIT, Math.min(LIMIT, x)));
        }}
        onPointerUp={() => {
          if (dx <= -THRESHOLD) onLeft();
          else if (dx >= THRESHOLD) onRight();
          reset();
        }}
        onPointerCancel={reset}
      >
        {children}
      </div>
    </div>
  );
}
