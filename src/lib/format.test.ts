import { describe, expect, it } from "vitest";

import { formatDate, formatDuration, formatTimeAgo } from "./format";

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

describe("formatTimeAgo", () => {
  const now = new Date(Date.UTC(2026, 10, 19, 12));
  const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000);

  it.each([
    [0, "just now"],
    [59, "just now"],
    [60, "1 minute ago"],
    [45 * 60, "45 minutes ago"],
    [60 * 60, "1 hour ago"],
    [23 * 3600, "23 hours ago"],
    [24 * 3600, "yesterday"],
    [3 * 86400, "3 days ago"],
    [14 * 86400, "2 weeks ago"],
    [60 * 86400, "2 months ago"],
    [400 * 86400, "last year"],
  ])("formats %i seconds ago as %s", (seconds, expected) => {
    expect(formatTimeAgo(ago(seconds), now)).toBe(expected);
  });
});
