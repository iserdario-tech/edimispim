import { describe, it, expect } from "vitest";
import { lightWindows } from "../src/light.js";
import { parseHM } from "../src/time.js";
describe("light", () => {
  it("morning light in first hour after wake", () => {
    const w = lightWindows({ wakeMin: parseHM("07:00"), bedMin: parseHM("23:00"), toggles:{}, recovery:false });
    const ml = w.find(x=>x.kind==="morning_light")!;
    expect(ml.startMin).toBe(parseHM("07:00"));
    expect(ml.endMin).toBe(parseHM("08:00"));
    expect(ml.available).toBe(true);
  });
  it("noBrightLight -> shows alternative action", () => {
    const w = lightWindows({ wakeMin: parseHM("07:00"), bedMin: parseHM("23:00"), toggles:{ noBrightLight:true }, recovery:false });
    const ml = w.find(x=>x.kind==="morning_light")!;
    expect(ml.detail).toMatch(/улиц|лампа/i);
  });
});
