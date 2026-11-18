/**
 * The six dimensions a recording is scored on, in display order, with their sub-scores and maximums
 * (SPEC → Assessment → Score). The maximums add up to 1000. Judged sub-scores carry the rubric Claude
 * scores them against, which is also what the speaker is shown; measured ones carry a description.
 */
export const DIMENSIONS = {
  structure: {
    name: "Structure",
    description: "How your answer is organised, judged against the category's framework.",
    max: 250,
    source: "judged",
    subScores: {
      logicalSequence: {
        name: "Logical sequence",
        max: 50,
        rubric: "Points come in an order that builds, following the category's framework steps.",
      },
      transitions: {
        name: "Transitions",
        max: 50,
        rubric: "Each point is linked to the next, so the listener can follow the thread.",
      },
      signposting: {
        name: "Signposting",
        max: 50,
        rubric: "The speaker tells the listener where the answer is going (\"there are two reasons\", \"finally\").",
      },
      openingQuality: {
        name: "Opening quality",
        max: 50,
        rubric: "The first sentence or two answer the topic directly and make the listener want to hear more.",
      },
      closingQuality: {
        name: "Closing quality",
        max: 50,
        rubric: "The answer ends deliberately, landing the main point rather than trailing off.",
      },
    },
  },
  conciseness: {
    name: "Conciseness",
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
        rubric: "No padding, repetition or redundant phrases (\"at this moment in time\", \"each and every\").",
      },
      sentenceLength: {
        name: "Sentence length",
        max: 60,
        rubric: "Sentences short enough to follow by ear: an average of 20 words or fewer is ideal, over 30 is too long.",
      },
    },
  },
  confidence: {
    name: "Confidence",
    description: "How firmly you state your points, without hedging them.",
    max: 150,
    source: "judged",
    subScores: {
      hedgingFrequency: {
        name: "Hedging frequency",
        max: 75,
        rubric: "Few hedges (\"I think\", \"sort of\", \"probably\", \"maybe\") softening claims that could stand on their own.",
      },
      assertiveness: {
        name: "Assertiveness",
        max: 75,
        rubric: "Claims are stated plainly and owned, without apologising for or undercutting them.",
      },
    },
  },
  pronunciation: {
    name: "Pronunciation",
    description: "How clearly your words came across. Accent never lowers it.",
    max: 150,
    source: "measured",
    subScores: {
      pronunciationClarity: {
        name: "Pronunciation clarity",
        max: 150,
        description: "The share of your words the transcription heard clearly.",
      },
    },
  },
  fillerRate: {
    name: "Filler rate",
    description: "How often you fill pauses with words like “um” or “you know”.",
    max: 150,
    source: "measured",
    subScores: {
      fillerFrequency: { name: "Filler frequency", max: 150, description: "Fillers per 100 words: the fewer, the higher." },
    },
  },
  pace: {
    name: "Pace",
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
        description: "Full marks for an Active WPM of 180 to 220, falling away either side.",
      },
    },
  },
} as const;

export type DimensionKey = keyof typeof DIMENSIONS;

export const DIMENSION_KEYS = Object.keys(DIMENSIONS) as DimensionKey[];

/** The highest score a recording can get, the sum of the dimension maximums: 1000. */
export const MAX_TOTAL = DIMENSION_KEYS.reduce((sum, key) => sum + DIMENSIONS[key].max, 0);
