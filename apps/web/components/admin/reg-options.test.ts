import { describe, expect, test } from "bun:test";
import { optionsError, optionsToText, parseOptions } from "./reg-options";

describe("category options", () => {
  test("one per line, trimmed, blanks dropped, and back", () => {
    expect(parseOptions("  Dentist \r\n\n Optometrist\n   \n")).toEqual(["Dentist", "Optometrist"]);
    expect(parseOptions("")).toEqual([]);
    expect(optionsToText(["A", "B"])).toBe("A\nB");
  });
  test("a good list has no error", () => {
    expect(optionsError(["A", "B"])).toBeNull();
    expect(optionsError([])).toBeNull();
    expect(optionsError(Array.from({ length: 20 }, (_, i) => `o${i}`))).toBeNull();
    expect(optionsError(["x".repeat(60)])).toBeNull();
  });
  test("too many, too long, repeated (any case)", () => {
    expect(optionsError(Array.from({ length: 21 }, (_, i) => `o${i}`))).toContain("at most 20");
    expect(optionsError(["x".repeat(61)])).toContain("61 characters");
    expect(optionsError(["Nurse", "nurse"])).toContain("more than once");
  });
});
