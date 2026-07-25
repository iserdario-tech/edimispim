import { describe, it, expect } from "vitest";
import { winddownWindows } from "../src/winddown.js";
import { parseHM } from "../src/time.js";
describe("winddown", () => {
  it("shower 90m and winddown 60m before bed", () => {
    const w = winddownWindows({ bedMin: parseHM("23:00"), toggles:{} });
    expect(w.find(x=>x.kind==="warm_shower")!.startMin).toBe(parseHM("21:30"));
    expect(w.find(x=>x.kind==="winddown")!.startMin).toBe(parseHM("22:00"));
    expect(w.find(x=>x.kind==="target_bed")!.startMin).toBe(parseHM("23:00"));
  });
  it("eveningBusy -> shortened winddown note", () => {
    const w = winddownWindows({ bedMin: parseHM("23:00"), toggles:{ eveningBusy:true } });
    expect(w.find(x=>x.kind==="winddown")!.detail).toMatch(/коротк/i);
  });
});
