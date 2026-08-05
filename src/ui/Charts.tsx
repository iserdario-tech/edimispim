import React from "react";

/**
 * Два маленьких графика, потерянных при переносе.
 *
 * Спарклайн качества сна был в pospat, линия веса — в oheedet. Оба рисуются нативным SVG,
 * без библиотек: одна зависимость ради двух графиков не окупается.
 */

/** Качество сна за неделю: точки — отмеченные дни, разрывы — пропущенные. */
export function SleepSparkline({ series }: { series: (number | null)[] }) {
  const W = 260, H = 44, pad = 5, n = series.length;
  if (series.filter(q => q != null).length < 2) return null;

  const x = (i: number) => pad + (i * (W - 2 * pad)) / (n - 1);
  const y = (q: number) => H - pad - ((q - 1) / 4) * (H - 2 * pad);
  const pts = series.map((q, i) => (q == null ? null : { x: x(i), y: y(q) }));

  const segs: string[] = [];
  for (let i = 1; i < n; i++) {
    const a = pts[i - 1], b = pts[i];
    if (a && b) segs.push(`${a.x},${a.y} ${b.x},${b.y}`);
  }

  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Качество сна за 7 дней">
      {segs.map((s, i) => (
        <polyline key={i} points={s} fill="none" stroke="currentColor" strokeWidth={2}
          strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {pts.map((p, i) => p && <circle key={i} cx={p.x} cy={p.y} r={2.8} fill="currentColor" />)}
    </svg>
  );
}

/** Линия веса с пунктиром цели. Одна точка — не линия, поэтому ничего не рисуем. */
export function WeightChart({ weights, goal }: {
  weights: { date: string; kg: number }[];
  goal?: number;
}) {
  if (weights.length < 2) return null;

  const W = 320, H = 140, padL = 8, padR = 34, padT = 14, padB = 20;
  const kgs = weights.map(w => w.kg);
  let lo = Math.min(...kgs, goal ?? Infinity);
  let hi = Math.max(...kgs, goal ?? -Infinity);
  if (hi - lo < 1) { lo -= 1; hi += 1; }        // защита от плоского диапазона

  const x = (i: number) => padL + (i * (W - padL - padR)) / (weights.length - 1);
  const y = (kg: number) => padT + ((hi - kg) * (H - padT - padB)) / (hi - lo);
  const pts = weights.map((w, i) => `${x(i).toFixed(1)},${y(w.kg).toFixed(1)}`).join(" ");
  const last = weights[weights.length - 1]!;

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Динамика веса">
      {goal !== undefined && goal >= lo && goal <= hi && (
        <>
          <line x1={padL} y1={y(goal)} x2={W - padR} y2={y(goal)} className="ch-goal" />
          <text x={W - padR + 4} y={y(goal) + 4} className="ch-goal-t">цель</text>
        </>
      )}
      <polyline points={pts} className="ch-line" />
      {weights.map((w, i) => <circle key={i} cx={x(i)} cy={y(w.kg)} r={3} className="ch-dot" />)}
      <text x={W - padR + 4} y={y(last.kg) + 4} className="ch-last">{last.kg}</text>
    </svg>
  );
}
