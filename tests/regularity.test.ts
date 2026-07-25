import { describe, it, expect } from "vitest";
import { regularityScore } from "../src/regularity.js";
const mk = (wokeHM:string, d:number) => ({ date:`2026-06-${String(d).padStart(2,"0")}`, wokeHM, quality:3 as const });
describe("regularity", () => {
  it("identical wake times -> 100", () => {
    expect(regularityScore([mk("07:00",1),mk("07:00",2),mk("07:00",3)])).toBe(100);
  });
  it("one outlier forgiven (MAD) -> still high", () => {
    const s = regularityScore([mk("07:00",1),mk("07:00",2),mk("07:00",3),mk("07:00",4),mk("10:00",5)]);
    expect(s).toBeGreaterThanOrEqual(90); // median-based: single outlier tolerated
  });
  it("empty -> 100", () => { expect(regularityScore([])).toBe(100); });
});
