import { describe, it, expect } from "vitest";
import { saveState, saveDayDraft, exportAll, type StorageLike, type StoredState } from "../src/ui/storage";
import { migrateAll, POSPAT_KEY, OHEEDET_KEY } from "../src/migrate";

/**
 * Страховка от потери чужих данных.
 *
 * Приложение живёт на ТОМ ЖЕ origin, что pospat и oheedet, — это нужно для автоматической
 * миграции. Обратная сторона: любая запись в чужой ключ затрёт данные живого приложения.
 * Ровно это и случилось при копировании кодовой базы: storage.ts достался от pospat вместе
 * с ключами `pospat.state.v1` / `pospat.day.v1`, и новое приложение стёрло бы профиль,
 * историю сна и переписку в работающем pospat.
 *
 * Эти тесты падают, если кто-то снова направит запись в чужое хранилище.
 */

const FOREIGN_KEYS = [POSPAT_KEY, OHEEDET_KEY, "pospat.day.v1", "pospat.coach.v1", "oheedet-theme"];

function recordingStore(): StorageLike & { written: string[] } {
  const data: Record<string, string> = {};
  const written: string[] = [];
  return {
    written,
    getItem: k => data[k] ?? null,
    setItem: (k, v) => { written.push(k); data[k] = v; },
  };
}

const state: StoredState = {
  profile: { anchorWakeHM: "07:00", targetSleepMin: 465, chronotype: "intermediate", caffeine: { typicalMgPerDose: 100, regularUser: true }, napPossibleByDefault: false, goal: "alertness" },
  history: [],
  screener: null,
};

describe("изоляция хранилища от pospat и oheedet", () => {
  it("сохранение состояния не трогает чужие ключи", () => {
    const store = recordingStore();
    saveState(state, store);
    expect(store.written).not.toEqual(expect.arrayContaining(FOREIGN_KEYS));
    expect(store.written.every(k => k.startsWith("edimispim."))).toBe(true);
  });

  it("сохранение контекста дня не трогает чужие ключи", () => {
    const store = recordingStore();
    saveDayDraft({ date: "2026-07-25", mode: "normal", crunchEndHM: "23:00", toggles: {} }, store);
    expect(store.written.every(k => k.startsWith("edimispim."))).toBe(true);
  });

  it("миграция только читает — ни одной записи в чужое хранилище", () => {
    const store = recordingStore();
    store.setItem(POSPAT_KEY, JSON.stringify({ profile: state.profile, history: [] }));
    store.setItem(OHEEDET_KEY, JSON.stringify({ progress: { weights: [] } }));
    const before = [...store.written];
    migrateAll(store);
    expect(store.written).toEqual(before);      // migrateAll не добавил ни одной записи
  });

  it("файл экспорта помечен своим приложением, чтобы не спутать с чужим", () => {
    const store = recordingStore();
    saveState(state, store);
    expect(JSON.parse(exportAll(store)).app).toBe("edimispim");
  });
});
