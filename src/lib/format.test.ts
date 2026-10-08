import { describe, expect, it } from "vitest";
import { formatDate, formatDuration } from "./format";

describe("formatDuration", () => {
  it.each([
    [0, "0:00"],
    [5, "0:05"],
    [59, "0:59"],
    [60, "1:00"],
    [125, "2:05"],
    [3600, "60:00"],
  ])("formats %i seconds as %s", (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});

describe("formatDate", () => {
  it("uses a medium date and short time in en-GB", () => {
    const date = new Date(2026, 2, 7, 14, 5);
    const formatted = formatDate(date);
    expect(formatted).toContain("7 Mar 2026");
    expect(formatted).toMatch(/14:05/);
  });
});
