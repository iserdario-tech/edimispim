import { describe, it, expect } from "vitest";
import { saveState, loadState, saveDayDraft, loadDayDraft, exportAll, importAll, type StoredState } from "../src/ui/storage.js";
function memStore() {
  const m = new Map<string,string>();
  return { getItem:(k:string)=>m.get(k) ?? null, setItem:(k:string,v:string)=>{m.set(k,v);} };
}
const profile = { anchorWakeHM:"07:00", targetSleepMin:465, chronotype:"intermediate",
  caffeine:{ typicalMgPerDose:200, regularUser:true }, napPossibleByDefault:true, goal:"alertness" } as const;

describe("storage", () => {
  it("round-trips state", () => {
    const s: StoredState = { profile, history:[], screener:null };
    const store = memStore(); saveState(s, store);
    expect(loadState(store)?.profile.anchorWakeHM).toBe("07:00");
  });
  it("empty -> null", () => { expect(loadState(memStore())).toBeNull(); });
  it("day draft round-trips for the same date only", () => {
    const store = memStore();
    saveDayDraft({ date:"2026-07-12", mode:"crunch", crunchEndHM:"04:00", toggles:{ hadAlcohol:true } }, store);
    expect(loadDayDraft("2026-07-12", store)?.mode).toBe("crunch");
    expect(loadDayDraft("2026-07-12", store)?.crunchEndHM).toBe("04:00");
    expect(loadDayDraft("2026-07-13", store)).toBeNull(); // вчерашний контекст не тянем
  });
  it("export -> import round-trips the whole state", () => {
    const src = memStore(); const dst = memStore();
    saveState({ profile, history: [{ date:"2026-07-12", wokeHM:"07:15", quality:4 }], screener:null }, src);
    const restored = importAll(exportAll(src), dst);
    expect(restored?.history[0]?.wokeHM).toBe("07:15");
    expect(loadState(dst)?.history[0]?.wokeHM).toBe("07:15"); // и записалось в хранилище
  });
  it("import rejects a foreign / broken file", () => {
    expect(importAll('{"hello":"world"}', memStore())).toBeNull();
    expect(importAll("не json", memStore())).toBeNull();
  });
});
