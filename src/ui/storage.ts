import type { Profile, DayLog, DayMode, DayToggles, ScreenerResult } from "../index.js";
import type { Constraints, FoodProfile, MealCount } from "../food/types.js";

export type StorageLike = { getItem(k: string): string | null; setItem(k: string, v: string): void };

/** Питание — вторая половина суток. Появляется после короткой формы, до неё приложение ведёт только сон. */
export interface FoodSettings {
  profile: FoodProfile;
  constraints: Constraints;
  mealCount: MealCount;
}

export interface StoredState {
  profile: Profile;
  history: DayLog[];
  screener: ScreenerResult | null;
  food?: FoodSettings;
  weights?: { date: string; kg: number }[];
}
// выбранный на сегодня контекст (режим + переключатели), чтобы не терялся при перезапуске PWA
export interface DayDraft { date: string; mode: DayMode; crunchEndHM: string; toggles: DayToggles }

const KEY = "edimispim.state.v1";
const DAY_KEY = "edimispim.day.v1";
function defaultStore(): StorageLike {
  return typeof localStorage !== "undefined"
    ? localStorage
    : { getItem: () => null, setItem: () => {} };
}
export function saveState(s: StoredState, store: StorageLike = defaultStore()): void {
  store.setItem(KEY, JSON.stringify(s));
}
export function loadState(store: StorageLike = defaultStore()): StoredState | null {
  const raw = store.getItem(KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as StoredState; } catch { return null; }
}
export function saveDayDraft(d: DayDraft, store: StorageLike = defaultStore()): void {
  store.setItem(DAY_KEY, JSON.stringify(d));
}
// вернёт черновик только если он за сегодня — вчерашний контекст не тянем
export function loadDayDraft(date: string, store: StorageLike = defaultStore()): DayDraft | null {
  const raw = store.getItem(DAY_KEY);
  if (!raw) return null;
  try { const d = JSON.parse(raw) as DayDraft; return d?.date === date ? d : null; } catch { return null; }
}

// Бэкап: всё хранится в localStorage, при очистке браузера пропадёт. Экспорт/импорт — страховка.
export function exportAll(store: StorageLike = defaultStore()): string {
  return JSON.stringify({ app: "edimispim", v: 1, state: store.getItem(KEY) }, null, 2);
}
// Импорт: принимает файл экспорта. Возвращает восстановленное состояние или null (кривой файл).
export function importAll(text: string, store: StorageLike = defaultStore()): StoredState | null {
  try {
    const parsed = JSON.parse(text);
    const stateStr: string | null = parsed?.state ?? null;
    if (!stateStr) return null;
    const state = JSON.parse(stateStr) as StoredState;
    if (!state?.profile?.anchorWakeHM) return null; // минимальная валидация: это точно наш профиль
    store.setItem(KEY, stateStr);
    return state;
  } catch { return null; }
}
