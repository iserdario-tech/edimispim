import { upsertDay, type DayRecord } from "./day-log.js";
import type { StorageLike } from "./ui/storage.js";
import type { Profile } from "./types.js";
import type { Constraints, FoodProfile, Screen } from "./food/types.js";

/**
 * Перенос данных из pospat и oheedet.
 *
 * ⚠️ Форматы РАЗНЫЕ, и это главная ловушка:
 *  - `pospat.state.v1` — объект, внутри которого `state` лежит СТРОКОЙ (двойная сериализация);
 *  - `oheedet` — обычный объект.
 * Перепутать легко, поэтому на оба формата есть тесты.
 */

export const POSPAT_KEY = "pospat.state.v1";
export const OHEEDET_KEY = "oheedet";

export interface Migrated {
  days: DayRecord[];
  sleepProfile?: Profile;
  foodProfile?: FoodProfile;
  constraints?: Constraints;
  screen?: Screen;
  notesRU: string[];               // что перенеслось, а что нет — показываем человеку честно
}

const parse = (raw: string | null): unknown => {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
};

/** История сна pospat: DayLog[] → суточные записи. */
export function fromPospat(raw: string | null): Pick<Migrated, "days" | "sleepProfile"> {
  const state = parse(raw) as { profile?: Profile; history?: unknown[] } | null;
  if (!state || !Array.isArray(state.history)) return { days: [] };

  let days: DayRecord[] = [];
  for (const entry of state.history) {
    const e = entry as { date?: string; wokeHM?: string; bedHM?: string; quality?: number; hadAlcohol?: boolean };
    if (!e?.date || !e.wokeHM || !e.quality) continue;   // битые записи молча пропускаем
    days = upsertDay(days, {
      date: e.date,
      sleep: {
        wokeHM: e.wokeHM,
        bedHM: e.bedHM,
        quality: e.quality as 1 | 2 | 3 | 4 | 5,
        alcohol: e.hadAlcohol,
      },
    });
  }
  return { days, sleepProfile: state.profile };
}

/** Файл экспорта pospat: { app, v, state } — где state СТРОКА, а не объект. */
export function fromPospatExportFile(text: string): Pick<Migrated, "days" | "sleepProfile"> {
  const file = parse(text) as { state?: string } | null;
  return fromPospat(typeof file?.state === "string" ? file.state : null);
}

/** Состояние oheedet: профиль, ограничения, скрининг и история веса. */
export function fromOheedet(
  raw: string | null,
): Pick<Migrated, "days" | "foodProfile" | "constraints" | "screen"> & { hadUnmappedMarks: boolean } {
  const state = parse(raw) as {
    profile?: FoodProfile;
    constraints?: Constraints;
    screen?: Screen;
    progress?: { weights?: { date?: string; kg?: number }[]; done?: Record<string, boolean> };
  } | null;
  if (!state) return { days: [], hadUnmappedMarks: false };

  let days: DayRecord[] = [];
  for (const w of state.progress?.weights ?? []) {
    if (!w?.date || typeof w.kg !== "number") continue;
    days = upsertDay(days, { date: w.date, body: { weightKg: w.kg } });
  }

  // Отметки «съел по плану» в oheedet индексируются днём недели 0..6 без даты —
  // привязать их к календарю невозможно, поэтому не переносим и говорим об этом прямо.
  const hadUnmappedMarks = Object.values(state.progress?.done ?? {}).some(Boolean);

  return {
    days,
    foodProfile: state.profile,
    constraints: state.constraints,
    screen: state.screen,
    hadUnmappedMarks,
  };
}

/** Полный перенос из localStorage того же origin. Ничего не пишет в старые ключи. */
export function migrateAll(store: StorageLike): Migrated {
  const sleep = fromPospat(store.getItem(POSPAT_KEY));
  const food = fromOheedet(store.getItem(OHEEDET_KEY));

  let days = sleep.days;
  for (const d of food.days) days = upsertDay(days, d);

  const notesRU: string[] = [];
  const sleepDays = sleep.days.length;
  const weightDays = food.days.length;
  if (sleepDays) notesRU.push(`Перенесено ночей сна: ${sleepDays}.`);
  if (weightDays) notesRU.push(`Перенесено замеров веса: ${weightDays}.`);
  if (food.hadUnmappedMarks) {
    notesRU.push("Отметки «съел по плану» из старого приложения перенести не удалось: там они хранились без дат.");
  }
  if (!sleepDays && !weightDays) notesRU.push("Прошлых данных не нашлось — начинаем с чистого листа.");

  return {
    days,
    sleepProfile: sleep.sleepProfile,
    foodProfile: food.foodProfile,
    constraints: food.constraints,
    screen: food.screen,
    notesRU,
  };
}
