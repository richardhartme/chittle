import { describe, expect, it } from "vitest";
import { parseSetup, recordingMode, setupHref } from "./practice";

const topicId = "6f1c2a4e-8b1d-4c3a-9e2f-1a2b3c4d5e6f";

describe("parseSetup", () => {
  it("reads the topic, speaking time and mode from the query", () => {
    expect(parseSetup({ topic: topicId, speak: "90", mode: "audio" })).toEqual({
      topicId,
      speakSeconds: 90,
      mode: "audio",
    });
  });

  it.each([
    ["1", 10],
    ["99999", 3600],
    ["45.6", 46],
  ])("brings a speaking time of %s within the limits as %i", (speak, expected) => {
    expect(parseSetup({ topic: topicId, speak, mode: "video" }).speakSeconds).toBe(expected);
  });

  it("leaves out anything missing", () => {
    expect(parseSetup({})).toEqual({});
  });

  it.each([
    ["a non-uuid topic", { topic: "nope" }],
    ["a repeated topic", { topic: [topicId, topicId] }],
    ["a non-numeric speaking time", { speak: "long" }],
    ["an empty speaking time", { speak: "" }],
    ["an unknown mode", { mode: "screen" }],
    ["a mode in the wrong case", { mode: "Audio" }],
  ])("leaves out %s", (_name, query) => {
    expect(parseSetup(query)).toEqual({});
  });
});

describe("setupHref", () => {
  const setup = { topicId, speakSeconds: 75, mode: "audio" } as const;

  it("builds a link to the given page with the setup in the query", () => {
    expect(setupHref("/practice/record", setup)).toBe(`/practice/record?topic=${topicId}&speak=75&mode=audio`);
  });

  it("round-trips through parseSetup", () => {
    const url = new URL(setupHref("/practice", setup), "http://localhost");
    expect(parseSetup(Object.fromEntries(url.searchParams))).toEqual(setup);
  });
});

describe("recordingMode", () => {
  it.each([
    ["audio/webm", "audio"],
    ["audio/mp4", "audio"],
    ["Audio/WebM;codecs=opus", "audio"],
    ["video/webm", "video"],
    ["video/mp4;codecs=avc1", "video"],
  ])("treats %s as %s", (mimeType, expected) => {
    expect(recordingMode(mimeType)).toBe(expected);
  });
});
