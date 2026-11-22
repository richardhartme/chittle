import { describe, expect, it } from "vitest";

import type { TranscriptWord } from "@/db/schema";

import { measure } from "./measure";

/**
 * Builds a transcript from a script. Words are spoken back to back, each lasting `wordSeconds` with
 * `gapSeconds` between them. `[1.5]` inserts a 1.5 second pause, and `word@0.5` sets a word's confidence.
 * Punctuation stays on the punctuated word and is stripped from the plain one, as Deepgram does.
 */
function script(text: string, { at = 0, wordSeconds = 0.3, gapSeconds = 0.1, confidence = 0.95 } = {}) {
  const words: TranscriptWord[] = [];
  let t = at;
  let pause: number | null = null;
  for (const token of text.split(/\s+/).filter(Boolean)) {
    const gap = token.match(/^\[(\d+(?:\.\d+)?)\]$/);
    if (gap) {
      pause = Number(gap[1]);
      continue;
    }
    if (words.length > 0) t += pause ?? gapSeconds;
    pause = null;
    const [punctuated, conf] = token.split("@");
    words.push({
      word: punctuated.toLowerCase().replace(/[^a-z'-]/g, ""),
      punctuated_word: punctuated,
      start: round(t),
      end: round(t + wordSeconds),
      confidence: conf ? Number(conf) : confidence,
    });
    t += wordSeconds;
  }
  return words;
}

const round = (t: number) => Math.round(t * 1000) / 1000;

/** `n` words spoken back to back at exactly `wpm`, with no gaps. */
function steady(n: number, wpm: number, { at = 0, word = "word", confidence = 0.95 } = {}) {
  const slot = 60 / wpm;
  return Array.from({ length: n }, (_, i): TranscriptWord => ({
    word,
    punctuated_word: word,
    start: at + i * slot,
    end: at + (i + 1) * slot,
    confidence,
  }));
}

/** Runs of steady speech, each `[words, wpm]` or `[words, wpm, word]`, with `gapSeconds` between them. */
function runs(spec: [number, number, string?][], gapSeconds = 0.6) {
  const words: TranscriptWord[] = [];
  let at = 0;
  for (const [n, wpm, word] of spec) {
    words.push(...steady(n, wpm, { at, word }));
    at = words[words.length - 1].end + gapSeconds;
  }
  return words;
}

describe("measure: filler rate", () => {
  it("counts Deepgram's filler tokens, with a breakdown by word", () => {
    const words = script("Um, I think, uh, we should, um, go. Mhm.");

    const { fillers } = measure(words, 60);

    expect(fillers.total).toBe(4);
    expect(fillers.breakdown).toEqual([
      { word: "um", count: 2 },
      { word: "mhm", count: 1 },
      { word: "uh", count: 1 },
    ]);
  });

  it("gives fillers per minute of the recording and per 100 words spoken", () => {
    const words = script("Um, so I, uh, went home and slept.");

    const { fillers } = measure(words, 30);

    expect(fillers.perMinute).toBe(4);
    expect(fillers.per100Words).toBe(25);
  });

  it("scores 139 of 150 at 1.4 fillers per 100 words, the reference calibration", () => {
    const words = [...steady(493, 180), ...steady(7, 180, { at: 200, word: "um" })];

    const { fillers, scores } = measure(words, 200);

    expect(fillers.per100Words).toBeCloseTo(1.4);
    expect(scores.fillerRate).toBe(139);
  });

  it("scores full marks with no fillers, falling as the rate rises, and never below zero", () => {
    const fillerScore = (fillers: number) =>
      measure([...steady(100 - fillers, 180), ...steady(fillers, 180, { at: 60, word: "uh" })], 60).scores.fillerRate;

    expect(fillerScore(0)).toBe(150);
    expect(fillerScore(3)).toBeLessThan(fillerScore(1));
    expect(fillerScore(10)).toBeLessThan(fillerScore(3));
    expect(fillerScore(40)).toBe(0);
  });
});

describe("measure: pronunciation", () => {
  it("gives clarity as the share of non-filler words heard with confidence of at least 0.8", () => {
    const words = script("Um@0.2 the@0.99 quick@0.8 brown@0.79 fox@0.5");

    const { pronunciation } = measure(words, 10);

    expect(pronunciation.clarity).toBe(0.5);
  });

  it("flags non-filler words under 0.6 confidence, with their timings", () => {
    const words = script("Uh@0.3 the@0.99 quixotic@0.41 plan@0.6 worked.@0.59");

    const { pronunciation } = measure(words, 10);

    expect(pronunciation.flagged).toEqual([
      { word: "quixotic", start: 0.8, end: 1.1, confidence: 0.41 },
      { word: "worked", start: 1.6, end: 1.9, confidence: 0.59 },
    ]);
  });

  it("scores 133 of 150 at 96% clarity, the reference calibration, and 150 when every word is clear", () => {
    const at96 = [...steady(96, 150), ...steady(4, 150, { at: 60, confidence: 0.7 })];

    expect(measure(at96, 60).scores.pronunciation).toBe(133);
    expect(measure(steady(100, 150), 60).scores.pronunciation).toBe(150);
  });

  it("scores less as clarity falls, and nothing once most words are unclear", () => {
    const score = (unclear: number) =>
      measure([...steady(100 - unclear, 150), ...steady(unclear, 150, { at: 60, confidence: 0.7 })], 60).scores
        .pronunciation;

    expect(score(10)).toBeLessThan(score(4));
    expect(score(50)).toBe(0);
  });
});

describe("measure: words per minute", () => {
  it("gives Overall WPM over the recording's full duration", () => {
    expect(measure(steady(30, 180), 15).pace.overallWpm).toBe(120);
  });

  it("gives Active WPM over speaking time, leaving out gaps of 2 seconds or more", () => {
    const words = [...steady(30, 180), ...steady(30, 180, { at: 15 })]; // 10s of speech, 5s silent, 10s of speech

    const { pace } = measure(words, 30);

    expect(pace.activeWpm).toBeCloseTo(180);
    expect(pace.overallWpm).toBe(120);
  });

  it("keeps gaps under 2 seconds in speaking time", () => {
    const words = [...steady(30, 180), ...steady(30, 180, { at: 11.9 })]; // a 1.9s gap

    expect(measure(words, 30).pace.activeWpm).toBeCloseTo((60 * 60) / 21.9);
  });

  it("scores full Words per minute marks for an Active WPM of 180 to 220", () => {
    expect(measure(steady(180, 180), 60).subScores.wordsPerMinute).toBe(50);
    expect(measure(steady(200, 200), 60).subScores.wordsPerMinute).toBe(50);
    expect(measure(steady(220, 220), 60).subScores.wordsPerMinute).toBe(50);
  });

  it("scores 39 of 50 at 172 Active WPM, the reference calibration, falling further from the ideal", () => {
    const score = (wpm: number) => measure(steady(wpm, wpm), 60).subScores.wordsPerMinute;

    expect(score(172)).toBe(39);
    expect(score(140)).toBeLessThan(score(172));
    expect(score(260)).toBeLessThan(score(230));
  });

  it("puts Active and Overall WPM in their bands", () => {
    const band = (wpm: number, seconds = 60) => {
      const { pace } = measure(steady(wpm, wpm), seconds);
      return [pace.activeBand, pace.overallBand];
    };

    expect(band(139)).toEqual(["Very slow", "Ideal"]);
    expect(band(180)).toEqual(["Ideal", "Fast"]);
    expect(band(221)).toEqual(["Fast", "Very fast"]);
    expect(band(300)).toEqual(["Very fast", "Very fast"]);
    expect(band(150, 100)).toEqual(["Slow", "Very slow"]);
  });
});

describe("measure: segments and baseline", () => {
  it("splits speech into segments at gaps of at least half a second, each with its WPM", () => {
    const words = script("One two three [0.5] four five [0.4] six", { wordSeconds: 0.3, gapSeconds: 0.1 });

    const { segments } = measure(words, 10).pace;

    expect(segments).toEqual([
      { start: 0, end: 1.1, words: 3, wpm: expect.closeTo(163.6, 1) },
      { start: 1.6, end: 3.0, words: 3, wpm: expect.closeTo(128.6, 1) },
    ]);
  });

  it("takes Baseline WPM as the word-weighted median of fluent segments, with an interquartile range", () => {
    const words = runs([
      [10, 150],
      [20, 180],
      [5, 240],
      [3, 400], // too short to count as fluent
      [8, 300, "um"], // has fillers, so not fluent
    ]);

    const { pace } = measure(words, 60);

    expect(pace.baselineWpm).toBeCloseTo(180);
    expect(pace.baselineRange).toEqual([expect.closeTo(150), expect.closeTo(180)]);
    expect(pace.baselineBand).toBe("Ideal");
  });

  it("finds rush and drag zones outside 1.36 and 0.64 times the baseline", () => {
    const words = runs([
      [20, 180],
      [5, 250],
      [5, 240],
      [5, 116],
      [5, 112],
      [20, 180],
    ]);

    const { pace } = measure(words, 60);

    expect(pace.baselineWpm).toBeCloseTo(180);
    expect(pace.rushThreshold).toBeCloseTo(244.8);
    expect(pace.dragThreshold).toBeCloseTo(115.2);
    expect(pace.rushZones.map((z) => Math.round(z.wpm))).toEqual([250]);
    expect(pace.dragZones.map((z) => Math.round(z.wpm))).toEqual([112]);
  });

  it("leaves the baseline empty, with no zones, when no segment is fluent", () => {
    const { pace } = measure(runs([[3, 180], [6, 300, "uh"]]), 10);

    expect(pace.baselineWpm).toBeNull();
    expect(pace.baselineBand).toBeNull();
    expect(pace.rushZones).toEqual([]);
    expect(pace.dragZones).toEqual([]);
  });
});

describe("measure: WPM over time", () => {
  it("gives the WPM of each 6-second window of speech, with their average, standard deviation and range", () => {
    const words = [...steady(24, 120), ...steady(48, 240, { at: 12 })];

    const { overTime } = measure(words, 24).pace;

    expect(overTime.windows.map((w) => w.wpm)).toEqual([120, 120, 240, 240]);
    expect(overTime.windows[1]).toMatchObject({ start: 6, end: 12 });
    expect(overTime.average).toBe(180);
    expect(overTime.standardDeviation).toBe(60);
    expect(overTime.range).toEqual([120, 240]);
  });

  it("uses one window when there's less than 6 seconds of speech", () => {
    const { overTime } = measure(steady(10, 150), 5).pace;

    expect(overTime.windows).toHaveLength(1);
    expect(overTime.windows[0].wpm).toBeCloseTo(150);
  });
});

describe("measure: pause timing", () => {
  // Enough words for Pace to be scored, ending a sentence so it adds no hesitation of its own.
  const opening = "We set off early in the morning with a list.";

  it("finds hesitation zones: pauses of a second or more in the middle of a sentence", () => {
    const words = script("I went to the [1.5] shops, and [0.9] bought bread.");

    const { hesitationZones } = measure(words, 10).pace;

    expect(hesitationZones).toEqual([{ start: 1.5, end: 3, seconds: 1.5 }]);
  });

  it("doesn't count pauses between sentences as hesitations", () => {
    const words = script("I went home. [3] Did I sleep? [2] Yes! [1.2] Soundly.");

    expect(measure(words, 20).pace.hesitationZones).toEqual([]);
  });

  it("scores full Pause timing marks with no hesitations", () => {
    expect(measure(script(`${opening} I went home. [3] Then I slept.`), 60).subScores.pauseTiming).toBe(50);
  });

  it("loses Pause timing points for longer and more frequent hesitations, never going below zero", () => {
    const score = (text: string, seconds = 60) => measure(script(`${opening} ${text}`), seconds).subScores.pauseTiming;
    const one = score("I went to the [1.5] shops.");

    expect(one).toBeLessThan(50);
    expect(score("I went to the [4] shops.")).toBeLessThan(one);
    expect(score("I went [1.5] to the [1.5] shops.")).toBeLessThan(one);
    expect(score("I [5] went [5] to [5] the [5] big [5] shops [5] today.")).toBe(0);
  });

  it("loses fewer Pause timing points for the same hesitations in a longer recording", () => {
    const words = script(`${opening} I went to the [1.5] shops.`);

    expect(measure(words, 120).subScores.pauseTiming).toBeGreaterThan(measure(words, 60).subScores.pauseTiming);
  });
});

describe("measure: sentences", () => {
  const sentence = (n: number) => `${"word ".repeat(n - 1)}end.`;

  it("counts words and sentences from punctuation, leaving out fillers, with an unfinished last sentence counted", () => {
    const { sentences } = measure(script("Um, I went home. Then I slept, uh, soundly! And woke"), 20);

    expect(sentences).toMatchObject({ words: 9, sentences: 3, averageLength: 3, averageBand: "Ideal", longSentences: 0 });
  });

  it("bands the average sentence length at 20 and 30 words", () => {
    const band = (...lengths: number[]) => measure(script(lengths.map(sentence).join(" ")), 60).sentences.averageBand;

    expect(band(20, 20)).toBe("Ideal");
    expect(band(21, 21)).toBe("Long");
    expect(band(30, 30)).toBe("Long");
    expect(band(31, 31)).toBe("Too long");
  });

  it("counts sentences of more than 30 words as long", () => {
    const { sentences } = measure(script([30, 31, 45, 5].map(sentence).join(" ")), 60);

    expect(sentences.longSentences).toBe(2);
    expect(sentences.averageLength).toBe(27.75);
  });
});

/** Every number anywhere in a value, so a test can check none is NaN or infinite. */
const numbersIn = (value: unknown): number[] =>
  typeof value === "number" ? [value] : value && typeof value === "object" ? Object.values(value).flatMap(numbersIn) : [];

describe("measure: edge cases", () => {
  it("scores nothing when nothing was said", () => {
    const result = measure([], 30);

    expect(result.scores).toEqual({ pace: 0, fillerRate: 0, pronunciation: 0 });
    expect(result.subScores).toEqual({ pauseTiming: 0, wordsPerMinute: 0 });
    expect(numbersIn(result).every(Number.isFinite)).toBe(true);
  });

  it("measures a single word without dividing by zero", () => {
    const result = measure(script("Hello."), 2);

    expect(result.pace.activeWpm).toBeCloseTo(200);
    expect(result.pace.segments).toHaveLength(1);
    expect(result.pace.baselineWpm).toBeNull();
    expect(result.sentences).toMatchObject({ words: 1, sentences: 1 });
    expect(numbersIn(result).every(Number.isFinite)).toBe(true);
  });

  it("scores no Pace for too little speech to have a pace", () => {
    expect(measure(script("Hello."), 2).scores.pace).toBe(0);
    expect(measure(script("I went to the shops and bought some bread."), 5).scores.pace).toBe(0);
    expect(measure(script("I went to the shops and bought some fresh bread."), 5).scores.pace).toBeGreaterThan(0);
  });

  it("scores nothing when every word is a filler", () => {
    const result = measure(script("Um, uh, um, uh, um, uh, um, uh, um, uh, um."), 6);

    expect(result.fillers.total).toBe(11);
    expect(result.scores).toEqual({ pace: 0, fillerRate: 0, pronunciation: 0 });
    expect(result.pronunciation.clarity).toBe(0);
    expect(result.scores.pronunciation).toBe(0);
    expect(result.sentences).toMatchObject({ words: 0, sentences: 0, averageLength: 0 });
  });

  it("copes with a recording of no duration", () => {
    const result = measure(script("Quick."), 0);

    expect(result.pace.overallWpm).toBe(0);
    expect(result.fillers.perMinute).toBe(0);
    expect(numbersIn(result).every(Number.isFinite)).toBe(true);
  });
});
