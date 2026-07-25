import { describe, it, expect } from "vitest";
import { loadState, isValidState, saveState, type StorageLike, type StoredState } from "../src/ui/storage";

/**
 * Регресс: повреждённое, но формально валидное состояние роняло приложение в белый экран
 * (`state.profile.anchorWakeHM` на массиве или объекте без профиля). Выйти было нельзя —
 * битые данные оставались в хранилище и при следующем запуске.
 */

const storeWith = (raw: string | null): StorageLike => ({
  getItem: () => raw,
  setItem: () => {},
});

const good: StoredState = {
  profile: { anchorWakeHM: "07:00", targetSleepMin: 465, chronotype: "intermediate", caffeine: { typicalMgPerDose: 100, regularUser: true }, napPossibleByDefault: false, goal: "alertness" },
  history: [],
  screener: null,
};

describe("loadState устойчив к битым данным", () => {
  it.each([
    ["не JSON", "абракадабра"],
    ["null", "null"],
    ["массив вместо объекта", "[]"],
    ["строка", '"просто строка"'],
    ["число", "42"],
    ["объект без профиля", '{"history":[]}'],
    ["профиль строкой", '{"profile":"сломано","history":[]}'],
    ["профиль без времени подъёма", '{"profile":{},"history":[]}'],
    ["history не массив", '{"profile":{"anchorWakeHM":"07:00"},"history":"нет"}'],
    ["weights не массив", '{"profile":{"anchorWakeHM":"07:00"},"history":[],"weights":"нет"}'],
  ])("%s → возвращает null, а не роняет интерфейс", (_name, raw) => {
    expect(loadState(storeWith(raw))).toBeNull();
  });

  it("нормальное состояние проходит", () => {
    expect(loadState(storeWith(JSON.stringify(good)))?.profile.anchorWakeHM).toBe("07:00");
  });

  it("битые записи в истории отсеиваются, остальное сохраняется", () => {
    const mixed = {
      ...good,
      history: [
        { date: "2026-07-01", wokeHM: "07:00", quality: 4 },
        null,
        { date: "2026-07-02" },                 // без времени подъёма
        { date: "2026-07-03", wokeHM: "06:50", quality: 3 },
      ],
    };
    const st = loadState(storeWith(JSON.stringify(mixed)))!;
    expect(st.history).toHaveLength(2);
    expect(st.history.map(h => h.date)).toEqual(["2026-07-01", "2026-07-03"]);
  });

  it("после сохранения состояние читается обратно без потерь", () => {
    let saved = "";
    const store: StorageLike = { getItem: () => saved, setItem: (_k, v) => { saved = v; } };
    saveState({ ...good, weights: [{ date: "2026-07-01", kg: 88 }] }, store);
    const back = loadState(store)!;
    expect(back.weights).toEqual([{ date: "2026-07-01", kg: 88 }]);
  });
});

describe("isValidState", () => {
  it("отличает годное состояние от мусора", () => {
    expect(isValidState(good)).toBe(true);
    expect(isValidState({})).toBe(false);
    expect(isValidState([])).toBe(false);
    expect(isValidState(null)).toBe(false);
  });
});
