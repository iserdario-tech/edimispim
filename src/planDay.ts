import type { Profile, DayContext, LastNight, DayLog, DayPlan, PlanWindow } from "./types.js";
import { computeBedMin } from "./modes.js";
import { caffeineWindows } from "./caffeine.js";
import { napWindow } from "./nap.js";
import { lightWindows } from "./light.js";
import { winddownWindows } from "./winddown.js";
import { computeReadiness } from "./readiness.js";

export function planDay(args: {
  profile: Profile; ctx: DayContext; lastNight: LastNight; history: DayLog[];
}): DayPlan {
  const { profile, ctx, lastNight, history } = args;
  const mode = ctx.mode;
  const { wakeMin, bedMin, badNight } = computeBedMin({ profile, ctx, lastNight });

  const windows: PlanWindow[] = [];
  windows.push(...lightWindows({ wakeMin, bedMin, toggles: ctx.toggles, recovery: mode === "recovery" }));
  windows.push(...caffeineWindows({ profile, bedMin, mode, toggles: ctx.toggles, badNight }));
  const nap = napWindow({ profile, wakeMin, bedMin, mode, toggles: ctx.toggles, badNight });
  if (nap) windows.push(nap);
  windows.push(...winddownWindows({ bedMin, toggles: ctx.toggles }));

  windows.sort((a, b) => a.startMin - b.startMin);

  const readiness = computeReadiness({ profile, lastNight, history, hadAlcohol: ctx.toggles.hadAlcohol });

  const notesRU: string[] = [];
  if (ctx.toggles.hadAlcohol)
    notesRU.push("Вчера был алкоголь: вторая половина сна пострадала (меньше глубокого и REM). Сегодня — вода и утренний свет, без позднего кофе; относись как к лёгкому долгу сна.");
  if (mode === "crunch")
    notesRU.push("Работаешь допоздна: сегодня просто уменьшаем вред, а завтра отсыпаешься. Недосып всё равно придётся вернуть.");
  if (mode === "recovery")
    notesRU.push("День восстановления: с утра побольше света и движения, кофе только рано. По-настоящему восстановит только ночной сон.");

  return { date: ctx.date, mode, windows, readiness, notesRU };
}
