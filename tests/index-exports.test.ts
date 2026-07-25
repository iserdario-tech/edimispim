import { describe, it, expect } from "vitest";
import { fmtHM, parseHM } from "../src/index.js";
describe("index exports time helpers", () => {
  it("fmtHM/parseHM re-exported", () => {
    expect(parseHM("07:00")).toBe(420);
    expect(fmtHM(1620)).toBe("03:00 (+1)");
  });
});
