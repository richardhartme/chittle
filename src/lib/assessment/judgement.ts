import { z } from "zod";
import { DIMENSIONS } from "./dimensions";

// Ranges and list lengths are in the descriptions, not Zod checks: structured outputs can't enforce
// them, and a reply just out of range should be clamped afterwards (see score.ts), not rejected.
// Scores are numbers rather than `z.int()`, whose safe-integer bounds would be checked the same way;
// clamping rounds them.

const judged = ({ max }: { max: number }) =>
  z.object({
    score: z.number().describe(`A whole number from 0 to ${max}.`),
    feedback: z.string().describe("One or two sentences on this sub-score, quoting the speaker's own words."),
  });

const { structure, conciseness, confidence } = DIMENSIONS;

const measured = z.object({
  feedback: z.string().describe("One or two sentences explaining this sub-score's measured result to the speaker."),
});

const summary = z.string().describe("A short paragraph summarising this dimension for the speaker.");

const phraseCount = z.object({
  phrase: z.string().describe("Exactly as it appears in the transcript."),
  count: z.number().describe("How many times it appears in the transcript used this way."),
});

/** What Claude returns for a recording: the judged scores and all the feedback text. */
export const judgementSchema = z.object({
  structure: z.object({
    summary,
    logicalSequence: judged(structure.subScores.logicalSequence),
    transitions: judged(structure.subScores.transitions),
    signposting: judged(structure.subScores.signposting),
    openingQuality: judged(structure.subScores.openingQuality),
    closingQuality: judged(structure.subScores.closingQuality),
  }),
  conciseness: z.object({
    summary,
    wordChoice: judged(conciseness.subScores.wordChoice),
    wordEconomy: judged(conciseness.subScores.wordEconomy),
    sentenceLength: judged(conciseness.subScores.sentenceLength),
  }),
  confidence: z.object({
    summary,
    hedgingFrequency: judged(confidence.subScores.hedgingFrequency),
    assertiveness: judged(confidence.subScores.assertiveness),
  }),
  pronunciation: z.object({ summary, pronunciationClarity: measured }),
  fillerRate: z.object({ summary, fillerFrequency: measured }),
  pace: z.object({ summary, pauseTiming: measured, wordsPerMinute: measured }),
  hedges: z.array(phraseCount).describe("Every hedge the speaker used, with how often."),
  discourseFillers: z
    .array(phraseCount)
    .describe(
      'Words used only to fill a pause, such as "like", "you know", "so" or "well", with how often they were used that ' +
        'way. Leave out "um", "uh" and similar sounds: those are already counted.',
    ),
  redundantPhrases: z.array(z.string()).describe("Phrases from the transcript that add words without adding meaning."),
  overview: z.string().describe("A short paragraph: the strongest point of the answer and the most useful thing to change."),
  strengths: z.array(z.string()).describe("1 to 3 things the speaker did well, each a short phrase."),
  areasToImprove: z.array(z.string()).describe("2 to 4 concrete changes to make next time, each a short phrase."),
});

export type Judgement = z.infer<typeof judgementSchema>;
