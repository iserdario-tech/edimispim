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
/**
 * Сохранение с защитой от переполнения хранилища.
 *
 * localStorage даёт около 5 МБ на весь сайт, и полугодовая история занимает жалкие
 * десятки килобайт — но квоту может выесть что-то другое, а в приватном режиме Safari
 * запись падает всегда. Раньше это валило приложение прямо в момент отметки сна:
 * человек нажимал «Записать ночь» и получал белый экран вместо сохранения.
 *
 * Теперь при нехватке места история подрезается (свежее важнее старого), а если не помогло —
 * возвращается `false`, и интерфейс честно говорит, что сохранить не вышло.
 */
export function saveState(s: StoredState, store: StorageLike = defaultStore()): boolean {
  const attempts = [s, { ...s, history: s.history.slice(-90) }, { ...s, history: s.history.slice(-30) }];
  for (const attempt of attempts) {
    try {
      store.setItem(KEY, JSON.stringify(attempt));
      return true;
    } catch { /* пробуем вариант поменьше */ }
  }
  return false;
}
/**
 * Проверка формы состояния перед тем, как его использовать.
 *
 * Одного `JSON.parse` мало: массив `[]`, объект без профиля или `history` строкой —
 * всё это валидный JSON, который проходит парсер, а падает уже в интерфейсе на
 * `state.profile.anchorWakeHM`. Итог — белый экран без возможности выйти,
 * потому что данные в хранилище остаются битыми и при следующем запуске.
 * Лучше показать онбординг, чем белый экран.
 */
export function isValidState(v: unknown): v is StoredState {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const s = v as Partial<StoredState>;
  if (typeof s.profile !== "object" || s.profile === null) return false;
  if (typeof (s.profile as Profile).anchorWakeHM !== "string") return false;
  if (!Array.isArray(s.history)) return false;
  if (s.weights !== undefined && !Array.isArray(s.weights)) return false;
  return true;
}

export function loadState(store: StorageLike = defaultStore()): StoredState | null {
  const raw = store.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isValidState(parsed)) return null;
    // отдельные записи истории тоже могут быть битыми — отсеиваем, а не роняем всё
    return { ...parsed, history: parsed.history.filter(h => h && typeof h.wokeHM === "string") };
  } catch { return null; }
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
/**
 * Ключи, которые тоже надо переносить вместе с профилем.
 *
 * Раньше копия содержала только основное состояние — и при переезде на другое устройство
 * человек терял всё, что копил руками: запомненные товары в магазинах, кладовку с остатками,
 * выбранный сервис доставки и переписку с коучем. Формально «данные перенеслись»,
 * а на деле половина работы пропадала.
 */
const EXTRA_KEYS = [
  "edimispim.favorites",   // мои товары в магазинах
  "edimispim.pantry",      // что осталось дома
  "edimispim.shop",        // выбранный сервис доставки
  "edimispim.coach.v1",    // переписка с коучем
] as const;

export function exportAll(store: StorageLike = defaultStore()): string {
  const extras: Record<string, string> = {};
  for (const k of EXTRA_KEYS) {
    const v = store.getItem(k);
    if (v !== null) extras[k] = v;
  }
  return JSON.stringify({ app: "edimispim", v: 2, state: store.getItem(KEY), extras }, null, 2);
}
/**
 * Импорт копии. Понимает и старый формат (v1, только состояние), и новый (v2, с довесками) —
 * копия, сделанная до этой правки, должна открываться, а не отвергаться.
 */
export function importAll(text: string, store: StorageLike = defaultStore()): StoredState | null {
  try {
    const parsed = JSON.parse(text);
    const stateStr: string | null = parsed?.state ?? null;
    if (!stateStr) return null;
    const state: unknown = JSON.parse(stateStr);
    if (!isValidState(state)) return null;      // та же проверка формы, что и при чтении

    store.setItem(KEY, stateStr);
    const extras = parsed?.extras;
    if (extras && typeof extras === "object" && !Array.isArray(extras)) {
      for (const k of EXTRA_KEYS) {
        const v = (extras as Record<string, unknown>)[k];
        if (typeof v === "string") store.setItem(k, v);
      }
    }
    return state;
  } catch { return null; }
}
