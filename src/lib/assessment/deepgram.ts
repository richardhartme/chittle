import { z } from "zod";
import type { TranscriptWord } from "@/db/schema";
import { getStorage } from "@/lib/storage";
import { AssessmentError } from "./errors";

const LISTEN_URL = "https://api.deepgram.com/v1/listen";

// Shorter than the 5 minutes after which a pending assessment counts as stale, so a slow
// request is recorded as failed before Retry can start a second one.
const TIMEOUT_MS = 4 * 60 * 1000;

export type TranscriptData = { text: string; words: TranscriptWord[]; audioSeconds: number };

const responseSchema = z.object({
  metadata: z.object({ duration: z.number() }).partial().optional(),
  results: z.object({
    channels: z
      .array(
        z.object({
          alternatives: z
            .array(
              z.object({
                transcript: z.string(),
                words: z.array(
                  z.object({
                    word: z.string(),
                    punctuated_word: z.string().optional(),
                    start: z.number(),
                    end: z.number(),
                    confidence: z.number(),
                  }),
                ),
              }),
            )
            .min(1),
        }),
      )
      .min(1),
  }),
});

function errorFor(status: number): string {
  if (status === 401) return "Deepgram rejected the key.";
  if (status === 402) return "Your Deepgram account is out of credit.";
  if (status === 403) return "Your Deepgram key isn't allowed to use Nova-3 transcription.";
  if (status === 400 || status === 413 || status === 415 || status === 422) {
    return "Deepgram couldn't read the recording's audio.";
  }
  if (status === 429) return "Deepgram is busy, try again in a minute.";
  return "Deepgram couldn't transcribe the recording, try again.";
}

/**
 * Streams a stored recording to Deepgram's pre-recorded endpoint (Nova-3, English, filler words
 * kept, punctuated) and returns its transcript. Failures throw an `AssessmentError`.
 */
export async function transcribe(
  recording: { storageKey: string; mimeType: string },
  deepgramKey: string,
): Promise<TranscriptData> {
  let file;
  try {
    file = await getStorage().get(recording.storageKey);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") throw new AssessmentError("The recording's file is missing.");
    if (err instanceof RangeError) throw new AssessmentError("The recording's file is empty.");
    throw err;
  }

  const url = new URL(LISTEN_URL);
  url.search = new URLSearchParams({ model: "nova-3", language: "en", filler_words: "true", punctuate: "true" }).toString();

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "POST",
      headers: { Authorization: `Token ${deepgramKey}`, "Content-Type": recording.mimeType },
      body: file.stream,
      // Node needs this to send a streamed request body.
      duplex: "half",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    } as RequestInit);
  } catch {
    await file.stream.cancel().catch(() => {});
    throw new AssessmentError("Couldn't reach Deepgram, try again.");
  }
  if (!res.ok) throw new AssessmentError(errorFor(res.status));

  const parsed = responseSchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new AssessmentError("Deepgram sent a reply we couldn't read, try again.");

  const { transcript, words } = parsed.data.results.channels[0].alternatives[0];
  const text = transcript.trim();
  if (!text || words.length === 0) throw new AssessmentError("No speech was detected.");

  return {
    text,
    words: words.map(({ word, punctuated_word, start, end, confidence }) => ({
      word,
      punctuated_word: punctuated_word ?? word,
      start,
      end,
      confidence,
    })),
    audioSeconds: parsed.data.metadata?.duration ?? words[words.length - 1].end,
  };
}
