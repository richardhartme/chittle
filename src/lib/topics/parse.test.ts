import { describe, expect, it } from "vitest";
import { parseTopicList } from "./parse";

describe("parseTopicList", () => {
  it("parses a bare JSON array", () => {
    expect(parseTopicList('["Describe your first job.", "What makes a good leader?"]')).toEqual([
      "Describe your first job.",
      "What makes a good leader?",
    ]);
  });

  it("tolerates code fences and surrounding text", () => {
    const raw = 'Here you go:\n```json\n["Talk about a book that changed you."]\n```';
    expect(parseTopicList(raw)).toEqual(["Talk about a book that changed you."]);
  });

  it("rejects replies without an array", () => {
    expect(() => parseTopicList("Sorry, I can't do that.")).toThrow();
  });

  it("rejects non-string entries", () => {
    expect(() => parseTopicList("[1, 2, 3]")).toThrow();
  });
});
