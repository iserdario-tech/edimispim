import type { Profile, DayLog, DayMode, DayToggles, ScreenerResult } from "../index.js";
import type { Constraints, FoodProfile, MealCount, Screen, SafeTargets } from "../food/types.js";
import { computeTargets, applySafety } from "../food/index.js";
import type { RampPace } from "../food/rampin.js";
import type { DayEaten } from "../food/eaten.js";
import type { StopBangAnswers, NesAnswers } from "../screening.js";

export type StorageLike = { getItem(k: string): string | null; setItem(k: string, v: string): void };

/** Питание — вторая половина суток. Появляется после короткой формы, до неё приложение ведёт только сон. */
export interface FoodSettings {
  profile: FoodProfile;
  constraints: Constraints;
  mealCount: MealCount;
  /** Как быстро спускаемся к целевому дефициту. Без значения — «обычно». */
  pace?: RampPace;
  /** День, с которого считается вхождение. Ставится один раз и не сбрасывается правкой формы:
   *  иначе каждый заход в настройки начинал бы лестницу заново и цель не наступала никогда. */
  startISO?: string;
  /** Скрининг питания (перенесён из oheedet). На нём стоят guardrails безопасности:
   *  при красных флагах дефицит смягчается, а человека отправляют к врачу. */
  screen?: Screen;
  /**
   * Ответы скрининга стыка: апноэ сна и ночное питание.
   *
   * Храним именно ОТВЕТЫ, а не готовые вердикты: вердикты считаются из них на лету
   * (`stopBang`, `nightEating`), поэтому формулировки живут в одном месте и правятся
   * один раз, а не расползаются копиями по хранилищу.
   */
  screening?: { stopBang?: StopBangAnswers; nes?: NesAnswers };
}

/**
 * Цели по калориям и белку для этих настроек — единственная точка входа.
 *
 * Раньше строка `applySafety(computeTargets(food.profile), food.profile, …)` стояла
 * в трёх экранах, и когда к ней добавился скрининг, править пришлось все три.
 * Один вызов — один шанс забыть аргумент.
 */
export const targetsFor = (food: FoodSettings): SafeTargets =>
  applySafety(computeTargets(food.profile), food.profile, food.screen ?? {});

export interface StoredState {
  profile: Profile;
  history: DayLog[];
  screener: ScreenerResult | null;
  food?: FoodSettings;
  weights?: { date: string; kg: number }[];
  /** Что съедено по дням: дата → отметки приёмов. Факт, без которого план не с чем сверять. */
  eaten?: Record<string, DayEaten>;
  /** Оценки блюд: id рецепта → 1 «нравится» или −1 «больше не предлагать». Только на устройстве. */
  ratings?: Record<string, 1 | -1>;
  /** Дни, объявленные читмилом. Запланированное послабление — не срыв, и статистика
   *  приверженности их не считает провалом (обоснование — `X28` научной базы). */
  cheatDays?: string[];
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
    // отдельные записи истории тоже могут быть битыми — отсеиваем, а не роняем всё.
    // Порядок восстанавливаем здесь же: ровность режима считает последние семь ЭЛЕМЕНТОВ
    // массива, а копия и перенос из старого приложения сортировки не гарантируют.
    return {
      ...parsed,
      history: parsed.history
        .filter(h => h && typeof h.wokeHM === "string")
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
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
