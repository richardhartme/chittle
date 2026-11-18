import type { TranscriptWord } from "@/db/schema";
import type { Judgement } from "@/lib/assessment/judgement";

/**
 * Transcript words for `text`, one every 0.4 seconds, all heard clearly. `word` is lower case without
 * punctuation, as Deepgram gives it.
 */
export function wordsOf(text: string): TranscriptWord[] {
  return text.split(/\s+/).map((punctuated, i) => ({
    word: punctuated.toLowerCase().replace(/[^a-z0-9'-]/g, ""),
    punctuated_word: punctuated,
    start: i * 0.4,
    end: i * 0.4 + 0.3,
    confidence: 0.99,
  }));
}

const sub = (score: number, feedback = "Feedback.") => ({ score, feedback });
const note = { feedback: "Measured feedback." };

/** A complete, valid reply from Claude, with every judged sub-score at 40. */
export function judgementFixture(overrides: Partial<Judgement> = {}): Judgement {
  return {
    structure: {
      summary: "Structure summary.",
      logicalSequence: sub(40),
      transitions: sub(40),
      signposting: sub(40),
      openingQuality: sub(40),
      closingQuality: sub(40),
    },
    conciseness: { summary: "Conciseness summary.", wordChoice: sub(40), wordEconomy: sub(40), sentenceLength: sub(40) },
    confidence: { summary: "Confidence summary.", hedgingFrequency: sub(40), assertiveness: sub(40) },
    pronunciation: { summary: "Pronunciation summary.", pronunciationClarity: note },
    fillerRate: { summary: "Filler rate summary.", fillerFrequency: note },
    pace: { summary: "Pace summary.", pauseTiming: note, wordsPerMinute: note },
    hedges: [],
    discourseFillers: [],
    redundantPhrases: [],
    overview: "A clear answer that could open more strongly.",
    strengths: ["Clear example"],
    areasToImprove: ["Open with your point", "Cut the hedges"],
    ...overrides,
  };
}
