import { describe, it, expect } from "vitest";
import { saveState, loadState, exportAll, importAll, type StorageLike, type StoredState } from "../src/ui/storage";
import { PUSH_READY, BACKEND_URL } from "../src/ui/notifications";

/** Хранилище в памяти — ведёт себя как localStorage, включая переполнение квоты. */
function memStore(limitBytes = Infinity): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: k => data[k] ?? null,
    setItem: (k, v) => {
      const size = Object.entries({ ...data, [k]: v }).reduce((s, [a, b]) => s + a.length + b.length, 0);
      if (size > limitBytes) { const e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; throw e; }
      data[k] = v;
    },
  };
}

const profile = {
  anchorWakeHM: "07:00", targetSleepMin: 465, chronotype: "intermediate" as const,
  caffeine: { typicalMgPerDose: 95, regularUser: true }, napPossibleByDefault: true, goal: "alertness" as const,
};

const fullState: StoredState = {
  profile,
  history: [{ date: "2026-07-24", wokeHM: "07:00", bedHM: "23:00", quality: 4 }],
  screener: null,
  weights: [{ date: "2026-07-24", kg: 88 }],
  food: {
    profile: { sex: "m", age: 33, heightCm: 180, weightKg: 88, goalWeightKg: 80, activity: "low" },
    constraints: { allergens: ["fish"], cookware: ["stove"], budget: "medium", cuisines: [], dislikes: ["капуста"] },
    mealCount: 4,
  },
};

describe("ничего не теряется при переезде", () => {
  it("копия увозит ВСЁ, что человек накопил руками, а не только профиль", () => {
    const src = memStore();
    saveState(fullState, src);
    src.setItem("edimispim.pantry", JSON.stringify({ "творог 5%|г": 100 }));
    src.setItem("edimispim.shop", "lavka");
    src.setItem("edimispim.coach.v1", JSON.stringify([{ role: "user", content: "привет" }]));

    const dst = memStore();
    const restored = importAll(exportAll(src), dst);

    expect(restored?.profile.anchorWakeHM).toBe("07:00");
    expect(restored?.food?.mealCount).toBe(4);
    expect(restored?.weights).toHaveLength(1);
    // самое важное: довески доехали
    expect(dst.getItem("edimispim.pantry")).toContain("творог");
    expect(dst.getItem("edimispim.shop")).toBe("lavka");
    expect(dst.getItem("edimispim.coach.v1")).toContain("привет");
  });

  it("старая копия без довесков всё ещё открывается", () => {
    const src = memStore();
    saveState(fullState, src);
    const oldFormat = JSON.stringify({ app: "edimispim", v: 1, state: src.getItem("edimispim.state.v1") });
    const dst = memStore();
    expect(importAll(oldFormat, dst)?.profile.anchorWakeHM).toBe("07:00");
  });

  it("чужой или битый файл не затирает текущие данные", () => {
    const store = memStore();
    saveState(fullState, store);
    const before = store.getItem("edimispim.state.v1");

    for (const junk of ['{"app":"другое"}', "не json", "{}", '{"state":"[]"}', '{"state":"{}"}']) {
      expect(importAll(junk, store)).toBeNull();
    }
    expect(store.getItem("edimispim.state.v1")).toBe(before);   // данные на месте
  });

  it("история за полгода помещается в разумный объём", () => {
    const store = memStore();
    const history = Array.from({ length: 180 }, (_, i) => ({
      date: `2026-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`,
      wokeHM: "07:00", bedHM: "23:00", quality: 4 as const, hadAlcohol: i % 7 === 0,
    }));
    saveState({ ...fullState, history }, store);
    const bytes = store.getItem("edimispim.state.v1")!.length;
    expect(bytes).toBeLessThan(60_000);     // localStorage даёт 5 МБ — запас огромный
  });

  it("переполнение хранилища не роняет приложение, а честно возвращает отказ", () => {
    const tiny = memStore(200);             // квота почти нулевая
    expect(() => saveState(fullState, tiny)).not.toThrow();
    expect(saveState(fullState, tiny)).toBe(false);
  });

  it("при нехватке места история подрезается, но профиль сохраняется", () => {
    const history = Array.from({ length: 180 }, (_, i) => ({
      date: `2026-01-${String(1 + (i % 28)).padStart(2, "0")}`,
      wokeHM: "07:00", bedHM: "23:00", quality: 4 as const,
    }));
    const full = JSON.stringify({ ...fullState, history }).length;
    // места хватает на профиль с урезанной историей, но не на полную
    const store = memStore(Math.round(full * 0.6));
    expect(saveState({ ...fullState, history }, store)).toBe(true);
    const back = loadState(store)!;
    expect(back.profile.anchorWakeHM).toBe("07:00");
    expect(back.history.length).toBeLessThan(180);
    expect(back.history.length).toBeGreaterThan(0);
  });
});

describe("уведомления", () => {
  it("пуши включены — у приложения есть свой сервер", () => {
    expect(PUSH_READY).toBe(true);
  });

  it("КРИТИЧНО: подписки идут в СВОЙ Worker, а не в pospat", () => {
    // Если сюда вернётся адрес pospat, подписки лягут в чужую базу: напоминания
    // будут приходить с его текстами и уводить в старое приложение.
    expect(BACKEND_URL).toContain("edimispim-push");
    expect(BACKEND_URL).not.toContain("pospat-push");
  });
});
