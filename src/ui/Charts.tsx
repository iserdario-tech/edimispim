/** Линия веса — нативный SVG, без библиотек: одна зависимость ради графика не окупается. */
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
