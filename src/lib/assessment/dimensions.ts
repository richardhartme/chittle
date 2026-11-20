/**
 * The six dimensions a recording is scored on, in display order, with their sub-scores and maximums
 * (SPEC → Assessment → Score). The maximums add up to 1000. Judged sub-scores carry the rubric Claude
 * scores them against, which is also what the speaker is shown; measured ones carry a description.
 */
export const DIMENSIONS = {
  structure: {
    name: "Shape",
    description: "How your answer is organised, judged against the category's framework.",
    max: 250,
    source: "judged",
    subScores: {
      logicalSequence: {
        name: "Logical sequence",
        max: 50,
        rubric: "Points follow the category's framework steps in order, and each builds on the last.",
      },
      transitions: {
        name: "Transitions",
        max: 50,
        rubric: "Each point links to the next, so the listener can follow the argument.",
      },
      signposting: {
        name: "Signposting",
        max: 50,
        rubric: "The speaker tells the listener where the answer is going, with phrases such as \"there are two reasons\" or \"finally\".",
      },
      openingQuality: {
        name: "Opening quality",
        max: 50,
        rubric: "The first sentence or two answer the topic directly and make the listener want to hear more.",
      },
      closingQuality: {
        name: "Closing quality",
        max: 50,
        rubric: "The answer ends by restating its main point instead of trailing off.",
      },
    },
  },
  conciseness: {
    name: "Brevity",
    description: "How few words you need to make your point.",
    max: 200,
    source: "judged",
    subScores: {
      wordChoice: {
        name: "Word choice",
        max: 70,
        rubric: "Precise, concrete words rather than vague or inflated ones.",
      },
      wordEconomy: {
        name: "Word economy",
        max: 70,
        rubric: "No padding, repetition or redundant phrases, such as \"at this moment in time\" or \"each and every\".",
      },
      sentenceLength: {
        name: "Sentence length",
        max: 60,
        rubric: "Sentences short enough to follow by ear. An average of 20 words or fewer is ideal, and over 30 is too long.",
      },
    },
  },
  confidence: {
    name: "Conviction",
    description: "How firmly you state your points, without hedging them.",
    max: 150,
    source: "judged",
    subScores: {
      hedgingFrequency: {
        name: "Hedging frequency",
        max: 75,
        rubric: "Few hedges, such as \"I think\", \"sort of\", \"probably\" or \"maybe\", on claims that could stand on their own.",
      },
      assertiveness: {
        name: "Assertiveness",
        max: 75,
        rubric: "The speaker states claims plainly and owns them, without apologising for them or undercutting them.",
      },
    },
  },
  pronunciation: {
    name: "Clarity",
    description: "How clearly the transcription heard your words. Your accent never lowers it.",
    max: 150,
    source: "measured",
    subScores: {
      pronunciationClarity: {
        name: "Word clarity",
        max: 150,
        description: "The share of your words the transcription heard clearly.",
      },
    },
  },
  fillerRate: {
    name: "Fluency",
    description: "How often you fill pauses with words like “um” or “you know”.",
    max: 150,
    source: "measured",
    subScores: {
      fillerFrequency: { name: "Filler frequency", max: 150, description: "Fillers per 100 words. Fewer fillers score higher." },
    },
  },
  pace: {
    name: "Rhythm",
    description: "How fast you speak, and where you pause.",
    max: 100,
    source: "measured",
    subScores: {
      pauseTiming: {
        name: "Pause timing",
        max: 50,
        description: "Long pauses in the middle of a sentence cost points. Pauses between sentences don't.",
      },
      wordsPerMinute: {
        name: "Words per minute",
        max: 50,
        description: "An Active WPM of 180 to 220 gets full marks. The score falls the further you are outside that range.",
      },
    },
  },
} as const;

export type DimensionKey = keyof typeof DIMENSIONS;

export const DIMENSION_KEYS = Object.keys(DIMENSIONS) as DimensionKey[];

/**
 * The two headings the dimensions are shown under: what the speaker said, judged by Claude from the
 * words, and how they said it, measured from the delivery.
 */
export const DIMENSION_GROUPS: { title: string; keys: DimensionKey[] }[] = [
  { title: "What you said", keys: DIMENSION_KEYS.filter((key) => DIMENSIONS[key].source === "judged") },
  { title: "How you said it", keys: DIMENSION_KEYS.filter((key) => DIMENSIONS[key].source === "measured") },
];

/** The highest score a recording can get, the sum of the dimension maximums: 1000. */
export const MAX_TOTAL = DIMENSION_KEYS.reduce((sum, key) => sum + DIMENSIONS[key].max, 0);
