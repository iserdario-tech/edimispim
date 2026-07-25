export function parseHM(hm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) throw new Error(`bad time: ${hm}`);
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 47 || min > 59) throw new Error(`bad time: ${hm}`);
  return h * 60 + min;
}
export function fmtHM(min: number): string {
  const wrapped = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60), m = wrapped % 60;
  const base = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return min >= 1440 ? `${base} (+1)` : base;
}
