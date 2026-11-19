import { z } from "zod";

export type Mode = "video" | "audio";

export type PracticeSetup = { topicId: string; speakSeconds: number; mode: Mode };

/** The part of a topic the practice pages show and pass around. */
export type TopicSummary = { id: string; text: string };

type SearchParams = Record<string, string | string[] | undefined>;

export const SPEAK_SECONDS = { min: 10, max: 3600, default: 120 } as const;

/** Rounds a speaking time and brings it within the allowed range. Not-a-number gives the minimum. */
export function clampSpeakSeconds(value: number): number {
  if (Number.isNaN(value)) return SPEAK_SECONDS.min;
  return Math.min(SPEAK_SECONDS.max, Math.max(SPEAK_SECONDS.min, Math.round(value)));
}

export function isMode(value: unknown): value is Mode {
  return value === "video" || value === "audio";
}

/**
 * Reads a practice setup from the query string. Each field is present only when its value is
 * usable, so callers choose their own fallbacks. A speaking time is brought within the limits.
 */
export function parseSetup(query: SearchParams): Partial<PracticeSetup> {
  const setup: Partial<PracticeSetup> = {};
  const { topic, speak, mode } = query;

  if (typeof topic === "string" && z.uuid().safeParse(topic).success) setup.topicId = topic;
  if (typeof speak === "string" && speak.trim() !== "" && Number.isFinite(Number(speak))) {
    setup.speakSeconds = clampSpeakSeconds(Number(speak));
  }
  if (isMode(mode)) setup.mode = mode;
  return setup;
}

/** A link to `path` carrying the setup in its query string, in the form `parseSetup` reads. */
export function setupHref(path: string, setup: PracticeSetup): string {
  const query = new URLSearchParams({ topic: setup.topicId, speak: String(setup.speakSeconds), mode: setup.mode });
  return `${path}?${query}`;
}

/** Whether a recording with this MIME type is audio only or video (with audio). */
export function recordingMode(mimeType: string): Mode {
  return mimeType.trim().toLowerCase().startsWith("audio/") ? "audio" : "video";
}

/** Speaking times for a retake are offered in steps of this many seconds. */
const RETAKE_STEP_SECONDS = 30;

/**
 * A link to setup for a retake of a recording: the same topic and mode, with the speaking time
 * taken from how long the recording ran, rounded to the nearest step and within the limits.
 */
export function practiceAgainHref(recording: { topicId: string; durationSeconds: number; mimeType: string }): string {
  const rounded = Math.round(recording.durationSeconds / RETAKE_STEP_SECONDS) * RETAKE_STEP_SECONDS;
  return setupHref("/practice", {
    topicId: recording.topicId,
    speakSeconds: clampSpeakSeconds(rounded),
    mode: recordingMode(recording.mimeType),
  });
}
