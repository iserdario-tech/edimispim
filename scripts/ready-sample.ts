/** Три «дня без готовки» подряд — посмотреть глазами, что собирает ready.ts. Запуск: npx vite-node scripts/ready-sample.ts */

import { composeReadyDay, packsRU } from "../src/food/ready";
const t = { bmr: 1700, tdee: 2300, kcalTarget: 1724, proteinGTarget: 130, fiberGTarget: 30, tempoKgPerWeek: 0.5 };
for (const off of [20734, 20735, 20736]) { const d = composeReadyDay(t as any, 4 as any, off); console.log(off, JSON.stringify(d.totals)); for (const p of d.picks) console.log("   " + p.slot + ": " + p.parts.map(x => `${x.item.name} (${packsRU(x.packs)})`).join(" + ")); }
