import { describe, it, expect } from "vitest";
import { parseHM, fmtHM } from "../src/time.js";

describe("time", () => {
  it("parses and formats", () => {
    expect(parseHM("07:00")).toBe(420);
    expect(parseHM("23:30")).toBe(1410);
    expect(fmtHM(420)).toBe("07:00");
  });
  it("formats next-day times", () => {
    expect(fmtHM(1620)).toBe("03:00 (+1)"); // 27:00
  });
});
