import { describe, it, expect } from "vitest";
import { fromPospat, fromPospatExportFile, fromOheedet, migrateAll, POSPAT_KEY, OHEEDET_KEY } from "../src/migrate";
import type { StorageLike } from "../src/ui/storage";

// Реальные форматы двух приложений — см. POSPAT-DATA.md §3 и OHEEDET-DATA.md §2.
const pospatState = {
  profile: { anchorWakeHM: "07:00", targetSleepMin: 465, chronotype: "intermediate", caffeine: { typicalMgPerDose: 100, regularUser: true }, napPossibleByDefault: false, goal: "alertness" },
  history: [
    { date: "2026-07-01", wokeHM: "07:10", bedHM: "23:40", quality: 3 },
    { date: "2026-07-02", wokeHM: "06:50", bedHM: "00:30", quality: 2, hadAlcohol: true },
  ],
  screener: null,
};

const oheedetState = {
  profile: { sex: "m", age: 33, heightCm: 180, weightKg: 88, goalWeightKg: 80, activity: "low" },
  constraints: { allergens: ["fish"], cookware: ["stove"], budget: "medium", cuisines: [], dislikes: ["капуста"] },
  screen: { conditions: [], scoffScore: 0 },
  progress: {
    done: { "0": true, "1": true },
    weights: [{ date: "2026-07-01", kg: 88.2 }, { date: "2026-07-08", kg: 87.4 }],
  },
};

const storeWith = (entries: Record<string, string>): StorageLike => ({
  getItem: k => entries[k] ?? null,
  setItem: () => {},
});

describe("fromPospat", () => {
  it("переносит историю сна в суточные записи", () => {
    const { days, sleepProfile } = fromPospat(JSON.stringify(pospatState));
    expect(days).toHaveLength(2);
    expect(days[0]!.sleep).toEqual({ wokeHM: "07:10", bedHM: "23:40", quality: 3, alcohol: undefined });
    expect(days[1]!.sleep?.alcohol).toBe(true);
    expect(sleepProfile?.anchorWakeHM).toBe("07:00");
  });

  it("битые записи пропускаются, а не роняют перенос", () => {
    const broken = { ...pospatState, history: [{ date: "2026-07-01" }, null, { wokeHM: "07:00", quality: 3 }, pospatState.history[0]] };
    expect(fromPospat(JSON.stringify(broken)).days).toHaveLength(1);
  });

  it("мусор и пустота не роняют перенос", () => {
    expect(fromPospat(null).days).toEqual([]);
    expect(fromPospat("не json").days).toEqual([]);
    expect(fromPospat("{}").days).toEqual([]);
  });
});

describe("fromPospatExportFile — state лежит СТРОКОЙ внутри объекта", () => {
  it("разбирает двойную сериализацию", () => {
    const file = JSON.stringify({ app: "pospat", v: 1, state: JSON.stringify(pospatState) });
    expect(fromPospatExportFile(file).days).toHaveLength(2);
  });

  it("файл, где state объект (а не строка), отвергается без падения", () => {
    const wrong = JSON.stringify({ app: "pospat", v: 1, state: pospatState });
    expect(fromPospatExportFile(wrong).days).toEqual([]);
  });
});

describe("fromOheedet — состояние лежит объектом, а не строкой", () => {
  it("переносит вес, профиль и ограничения", () => {
    const r = fromOheedet(JSON.stringify(oheedetState));
    expect(r.days.map(d => d.body?.weightKg)).toEqual([88.2, 87.4]);
    expect(r.foodProfile?.weightKg).toBe(88);
    expect(r.constraints?.dislikes).toEqual(["капуста"]);
  });

  it("сообщает, что отметки без дат перенести нельзя", () => {
    expect(fromOheedet(JSON.stringify(oheedetState)).hadUnmappedMarks).toBe(true);
    expect(fromOheedet(JSON.stringify({ ...oheedetState, progress: { weights: [] } })).hadUnmappedMarks).toBe(false);
  });

  it("мусор не роняет перенос", () => {
    expect(fromOheedet("не json").days).toEqual([]);
    expect(fromOheedet(null).days).toEqual([]);
  });
});

describe("migrateAll", () => {
  it("сон и вес за одну дату сливаются в один день", () => {
    const m = migrateAll(storeWith({
      [POSPAT_KEY]: JSON.stringify(pospatState),
      [OHEEDET_KEY]: JSON.stringify(oheedetState),
    }));
    const first = m.days.find(d => d.date === "2026-07-01")!;
    expect(first.sleep?.quality).toBe(3);
    expect(first.body?.weightKg).toBe(88.2);
    expect(m.days).toHaveLength(3);        // 01, 02, 08
  });

  it("честно рассказывает, что перенеслось", () => {
    const m = migrateAll(storeWith({
      [POSPAT_KEY]: JSON.stringify(pospatState),
      [OHEEDET_KEY]: JSON.stringify(oheedetState),
    }));
    expect(m.notesRU.join(" ")).toMatch(/ночей сна: 2/);
    expect(m.notesRU.join(" ")).toMatch(/веса: 2/);
    expect(m.notesRU.join(" ")).toMatch(/без дат/);
  });

  it("пустое хранилище — не ошибка, а чистый лист", () => {
    const m = migrateAll(storeWith({}));
    expect(m.days).toEqual([]);
    expect(m.notesRU.join(" ")).toMatch(/чистого листа/);
  });
});

/**
 * Самая дорогая потеря во всём приложении: из перенесённых суток забирались только
 * замеры веса, а ночи сна выбрасывались — при этом человеку писали «Перенесено ночей
 * сна: N». Ради этих ночей вся миграция и затевалась: без них не считаются ни ровность
 * режима, ни разбор плато, ни «почему сегодня так».
 */
describe("перенос отдаёт и ночи, и вес, и скрининг", () => {
  it("ночи сна доезжают до нового приложения, а не только считаются в отчёте", () => {
    const store = {
      "pospat.state.v1": JSON.stringify({
        profile: { anchorWakeHM: "07:00", targetSleepMin: 465 },
        history: [
          { date: "2026-07-01", wokeHM: "07:10", bedHM: "23:20", quality: 4 },
          { date: "2026-07-02", wokeHM: "06:55", bedHM: "23:05", quality: 3, hadAlcohol: true },
        ],
      }),
      "oheedet": JSON.stringify({
        profile: { sex: "m", age: 30, heightCm: 180, weightKg: 90, activity: "low" },
        screen: { scoffScore: 2 },
        progress: { weights: [{ date: "2026-07-01", kg: 90 }] },
      }),
    } as Record<string, string>;

    const m = migrateAll({ getItem: (k) => store[k] ?? null, setItem: () => {} });

    const nights = m.days.filter(d => d.sleep);
    expect(nights).toHaveLength(2);
    expect(nights[0]!.sleep!.wokeHM).toBe("07:10");
    expect(nights[1]!.sleep!.alcohol).toBe(true);

    // и отчёт не должен обещать больше, чем перенесено
    expect(m.notesRU.join(" ")).toContain("Перенесено ночей сна: 2");

    // скрининг питания нужен guardrails безопасности — он тоже должен доехать
    expect(m.screen?.scoffScore).toBe(2);
  });
});
