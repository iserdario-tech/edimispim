import { describe, it, expect } from "vitest";
import { runScreener } from "../src/screener.js";
const none = { loudSnoringWithPauses:false, daytimeSleepyDespiteEnoughSleep:false,
  legUrgeToMoveEvening:false, insomnia3xWeek3Months:false, lowMood2Weeks:false, selfHarmThoughts:false };
describe("screener", () => {
  it("clean -> not flagged", () => {
    expect(runScreener(none).flagged).toBe(false);
  });
  it("apnea signs -> flagged with doctor message", () => {
    const r = runScreener({ ...none, loudSnoringWithPauses:true, daytimeSleepyDespiteEnoughSleep:true });
    expect(r.flagged).toBe(true);
    expect(r.messagesRU.join(" ")).toMatch(/врач|апноэ/i);
  });
  it("selfHarm -> urgent", () => {
    expect(runScreener({ ...none, selfHarmThoughts:true }).urgent).toBe(true);
  });
});
