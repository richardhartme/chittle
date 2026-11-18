import type { TranscriptWord } from "@/db/schema";
import { DIMENSIONS } from "./dimensions";

/** Deepgram's filler tokens (with `filler_words=true`), in their plain-word form. */
export const FILLER_TOKENS: ReadonlySet<string> = new Set(["uh", "um", "mhm", "mm-mm", "uh-uh", "uh-huh", "nuh-uh", "hmm"]);

/** Filler rate (out of 150) loses this many points per filler per 100 words: 1.4 per 100 words scores 139. */
export const FILLER_POINTS_PER_RATE = 8;

/** Words heard with at least this confidence count as clear. */
export const CLEAR_CONFIDENCE = 0.8;
/** Words heard with less than this confidence are flagged as unclear. */
export const FLAGGED_CONFIDENCE = 0.6;
/**
 * Pronunciation scores 150 at 100% clarity, falling in a straight line to 0 at this clarity: 96%
 * clarity scores 133. It's about how clearly words land, never about accent.
 */
export const ZERO_PRONUNCIATION_CLARITY = 0.65;

/** With fewer non-filler words than this there's too little speech to have a pace, so Pace scores nothing. */
export const MIN_PACE_WORDS = 10;
/** Gaps between words of at least this long are thinking pauses, left out of Active WPM's speaking time. */
export const LONG_GAP_SECONDS = 2;
/** Words per minute scores full marks for an Active WPM inside this range. */
export const IDEAL_ACTIVE_WPM = { min: 180, max: 220 } as const;
/**
 * Outside the ideal range, Words per minute falls as `exp(-distance / this)`: 172 Active WPM, 8 below
 * the range, scores 39 of 50.
 */
export const WPM_SCORE_FALLOFF = 32;

/** Speech is split into segments at gaps of at least this long. */
export const SEGMENT_GAP_SECONDS = 0.5;
/** A segment with no fillers and at least this many words is fluent, and counts towards the baseline. */
export const FLUENT_SEGMENT_MIN_WORDS = 4;
/** Segments faster than the baseline times this are rush zones. */
export const RUSH_FACTOR = 1.36;
/** Segments slower than the baseline times this are drag zones. */
export const DRAG_FACTOR = 0.64;
/** Shorter segments are too brief for their WPM to mean much, so are never rush or drag zones. */
export const ZONE_MIN_WORDS = 3;

/** A pause of at least this long in the middle of a sentence is a hesitation zone. */
export const HESITATION_GAP_SECONDS = 1;
/**
 * Pause timing (out of 50) loses this many points for each hesitation, plus `HESITATION_POINTS_PER_SECOND`
 * for each second it runs past `HESITATION_GAP_SECONDS`. The loss is per minute of recording (at least
 * one), so the same pauses cost less in a longer answer.
 */
export const HESITATION_POINTS = 5;
export const HESITATION_POINTS_PER_SECOND = 3;
/** A word ending in one of these ends a sentence. */
const SENTENCE_END = /[.?!]["')\]]*$/;

/** Average sentence length bands (in words) for Conciseness: up to 20 is ideal, up to 30 long. */
export const SENTENCE_LENGTH_BANDS = { idealTo: 20, longTo: 30 } as const;
/** Sentences of more than this many words count as long. */
export const LONG_SENTENCE_WORDS = 30;
export type SentenceBand = "Ideal" | "Long" | "Too long";

/** WPM over time is measured in windows of about this long. */
export const WINDOW_SECONDS = 6;

/** Band edges for Active and Baseline WPM (from SPEC), slowest first. The middle band is the ideal. */
export const ACTIVE_WPM_BANDS = [140, 180, 220, 260] as const;
/** Band edges for Overall WPM, which counts pauses so runs lower. */
export const OVERALL_WPM_BANDS = [100, 130, 160, 190] as const;
export const BAND_LABELS = ["Very slow", "Slow", "Ideal", "Fast", "Very fast"] as const;
export type PaceBand = (typeof BAND_LABELS)[number];

/** The maximum score of each measured dimension and sub-score. */
export const MAX_SCORE = {
  pace: DIMENSIONS.pace.max,
  pauseTiming: DIMENSIONS.pace.subScores.pauseTiming.max,
  wordsPerMinute: DIMENSIONS.pace.subScores.wordsPerMinute.max,
  fillerRate: DIMENSIONS.fillerRate.max,
  pronunciation: DIMENSIONS.pronunciation.max,
};

export type FillerCount = { word: string; count: number };

export type FlaggedWord = { word: string; start: number; end: number; confidence: number };

/** A run of speech between pauses of at least `SEGMENT_GAP_SECONDS`. */
export type Segment = { start: number; end: number; words: number; wpm: number };

export type Pause = { start: number; end: number; seconds: number };

export type WpmWindow = { start: number; end: number; wpm: number };

export type Measurement = {
  fillers: { total: number; perMinute: number; per100Words: number; breakdown: FillerCount[] };
  /** Clarity is a share from 0 to 1. */
  pronunciation: { clarity: number; flagged: FlaggedWord[] };
  /** WPM counts every word Deepgram heard, fillers included: fillers are already scored under Filler rate. */
  pace: {
    overallWpm: number;
    activeWpm: number;
    overallBand: PaceBand;
    activeBand: PaceBand;
    segments: Segment[];
    /** Null when no segment is fluent enough to judge the speaker's usual pace. */
    baselineWpm: number | null;
    baselineRange: [number, number] | null;
    baselineBand: PaceBand | null;
    rushThreshold: number | null;
    dragThreshold: number | null;
    rushZones: Segment[];
    dragZones: Segment[];
    hesitationZones: Pause[];
    overTime: { windows: WpmWindow[]; average: number; standardDeviation: number; range: [number, number] };
  };
  /** For Conciseness, scored by the judging step. Sentence lengths leave out fillers. */
  sentences: { words: number; sentences: number; averageLength: number; averageBand: SentenceBand; longSentences: number };
  scores: { pace: number; fillerRate: number; pronunciation: number };
  subScores: { pauseTiming: number; wordsPerMinute: number };
};

const isFiller = (w: TranscriptWord) => FILLER_TOKENS.has(w.word.toLowerCase());

/** Calculates the measured dimensions and statistics from a transcript's words. Pure. */
export function measure(words: TranscriptWord[], durationSeconds: number): Measurement {
  const fillerWords = words.filter(isFiller);
  const per100Words = ratio(fillerWords.length * 100, words.length);
  const spoken = words.filter((w) => !isFiller(w));
  const clarity = ratio(spoken.filter((w) => w.confidence >= CLEAR_CONFIDENCE).length, spoken.length);
  const overallWpm = ratio(words.length * 60, durationSeconds);
  const activeWpm = ratio(words.length * 60, speakingSeconds(words));
  const segments = segment(words);
  const baseline = baselineOf(segments);
  const rushThreshold = baseline && baseline.wpm * RUSH_FACTOR;
  const dragThreshold = baseline && baseline.wpm * DRAG_FACTOR;
  const plainSegments = segments.map(({ start, end, words, wpm }): Segment => ({ start, end, words, wpm }));
  const zoneable = plainSegments.filter((s) => s.words >= ZONE_MIN_WORDS);
  const hesitationZones = hesitations(words);
  // Nothing said (fillers aside) scores nothing, rather than full marks for having no fillers or pauses.
  const said = spoken.length > 0;
  const hasPace = spoken.length >= MIN_PACE_WORDS;
  const pauseTiming = hasPace ? pauseTimingScore(hesitationZones, durationSeconds) : 0;
  const wordsPerMinute = hasPace ? wordsPerMinuteScore(activeWpm) : 0;
  return {
    fillers: {
      total: fillerWords.length,
      perMinute: ratio(fillerWords.length * 60, durationSeconds),
      per100Words,
      breakdown: countBy(fillerWords.map((w) => w.word.toLowerCase())),
    },
    pronunciation: {
      clarity,
      flagged: spoken
        .filter((w) => w.confidence < FLAGGED_CONFIDENCE)
        .map(({ word, start, end, confidence }) => ({ word, start, end, confidence })),
    },
    pace: {
      overallWpm,
      activeWpm,
      overallBand: band(overallWpm, OVERALL_WPM_BANDS),
      activeBand: band(activeWpm, ACTIVE_WPM_BANDS),
      segments: plainSegments,
      baselineWpm: baseline?.wpm ?? null,
      baselineRange: baseline?.range ?? null,
      baselineBand: baseline && band(baseline.wpm, ACTIVE_WPM_BANDS),
      rushThreshold,
      dragThreshold,
      rushZones: rushThreshold === null ? [] : zoneable.filter((s) => s.wpm > rushThreshold),
      dragZones: dragThreshold === null ? [] : zoneable.filter((s) => s.wpm < dragThreshold),
      hesitationZones,
      overTime: overTime(words),
    },
    sentences: sentenceStats(words),
    subScores: { pauseTiming, wordsPerMinute },
    scores: {
      pace: pauseTiming + wordsPerMinute,
      fillerRate: said ? fillerRateScore(per100Words) : 0,
      pronunciation: clampScore(
        (MAX_SCORE.pronunciation * (clarity - ZERO_PRONUNCIATION_CLARITY)) / (1 - ZERO_PRONUNCIATION_CLARITY),
        MAX_SCORE.pronunciation,
      ),
    },
  };
}

/** Each measured sub-score, by its key in `DIMENSIONS`. */
export function measuredSubScores({ scores, subScores }: Measurement): Record<string, number> {
  return { pronunciationClarity: scores.pronunciation, fillerFrequency: scores.fillerRate, ...subScores };
}

/**
 * The Filler rate score (out of 150) for a rate of fillers per 100 words. Exported so the judging step
 * can rescore once it has added the discourse fillers Claude finds.
 */
export function fillerRateScore(per100Words: number): number {
  return clampScore(MAX_SCORE.fillerRate - FILLER_POINTS_PER_RATE * per100Words, MAX_SCORE.fillerRate);
}

/** Time spent speaking: every word, and the gaps between them shorter than a long gap. */
function speakingSeconds(words: TranscriptWord[]): number {
  let seconds = 0;
  words.forEach((w, i) => {
    seconds += w.end - w.start;
    const gap = i > 0 ? w.start - words[i - 1].end : 0;
    if (gap > 0 && gap < LONG_GAP_SECONDS) seconds += gap;
  });
  return seconds;
}

const endsSentence = (w: TranscriptWord) => SENTENCE_END.test(w.punctuated_word);

/** Pauses of at least `HESITATION_GAP_SECONDS` after a word that doesn't end a sentence. */
function hesitations(words: TranscriptWord[]): Pause[] {
  return words.slice(1).flatMap((w, i) => {
    const before = words[i];
    const seconds = w.start - before.end;
    return seconds >= HESITATION_GAP_SECONDS && !endsSentence(before) ? [{ start: before.end, end: w.start, seconds }] : [];
  });
}

function pauseTimingScore(zones: Pause[], durationSeconds: number): number {
  const lost = zones.reduce(
    (sum, z) => sum + HESITATION_POINTS + HESITATION_POINTS_PER_SECOND * (z.seconds - HESITATION_GAP_SECONDS),
    0,
  );
  return clampScore(MAX_SCORE.pauseTiming - lost / Math.max(1, durationSeconds / 60), MAX_SCORE.pauseTiming);
}

function sentenceStats(words: TranscriptWord[]): Measurement["sentences"] {
  const lengths: number[] = [];
  let length = 0;
  words.forEach((w, i) => {
    if (!isFiller(w)) length++;
    if ((endsSentence(w) || i === words.length - 1) && length > 0) {
      lengths.push(length);
      length = 0;
    }
  });
  const total = lengths.reduce((a, b) => a + b, 0);
  const averageLength = ratio(total, lengths.length);
  return {
    words: total,
    sentences: lengths.length,
    averageLength,
    averageBand:
      averageLength <= SENTENCE_LENGTH_BANDS.idealTo ? "Ideal" : averageLength <= SENTENCE_LENGTH_BANDS.longTo ? "Long" : "Too long",
    longSentences: lengths.filter((n) => n > LONG_SENTENCE_WORDS).length,
  };
}

type FluencySegment = Segment & { fluent: boolean };

function segment(words: TranscriptWord[]): FluencySegment[] {
  const groups: TranscriptWord[][] = [];
  words.forEach((w, i) => {
    if (i === 0 || w.start - words[i - 1].end >= SEGMENT_GAP_SECONDS) groups.push([]);
    groups[groups.length - 1].push(w);
  });
  return groups.map((group) => {
    const start = group[0].start;
    const end = group[group.length - 1].end;
    return {
      start,
      end,
      words: group.length,
      wpm: ratio(group.length * 60, end - start),
      fluent: group.length >= FLUENT_SEGMENT_MIN_WORDS && !group.some(isFiller),
    };
  });
}

/**
 * The word-weighted median WPM of the fluent segments, with their interquartile range. Each percentile
 * is the first segment (slowest first) whose running word count reaches it, without interpolating.
 */
function baselineOf(segments: FluencySegment[]): { wpm: number; range: [number, number] } | null {
  const fluent = segments.filter((s) => s.fluent).sort((a, b) => a.wpm - b.wpm);
  if (fluent.length === 0) return null;
  const total = fluent.reduce((sum, s) => sum + s.words, 0);
  const percentile = (p: number) => {
    let seen = 0;
    return fluent.find((s) => (seen += s.words) >= p * total)!.wpm;
  };
  return { wpm: percentile(0.5), range: [percentile(0.25), percentile(0.75)] };
}

/** Splits the time from the first word to the last into equal windows of about `WINDOW_SECONDS`. */
function overTime(words: TranscriptWord[]): Measurement["pace"]["overTime"] {
  if (words.length === 0) return { windows: [], average: 0, standardDeviation: 0, range: [0, 0] };
  const from = words[0].start;
  const span = words[words.length - 1].end - from;
  const count = Math.max(1, Math.round(span / WINDOW_SECONDS));
  const length = span / count;
  const tally = new Array<number>(count).fill(0);
  for (const w of words) tally[Math.min(count - 1, Math.floor(ratio(w.start - from, length)))]++;
  const windows = tally.map((n, i) => ({ start: from + i * length, end: from + (i + 1) * length, wpm: ratio(n * 60, length) }));
  const wpms = windows.map((w) => w.wpm);
  const average = wpms.reduce((a, b) => a + b, 0) / count;
  const variance = wpms.reduce((sum, wpm) => sum + (wpm - average) ** 2, 0) / count;
  return { windows, average, standardDeviation: Math.sqrt(variance), range: [Math.min(...wpms), Math.max(...wpms)] };
}

function wordsPerMinuteScore(activeWpm: number): number {
  const distance = Math.max(0, IDEAL_ACTIVE_WPM.min - activeWpm, activeWpm - IDEAL_ACTIVE_WPM.max);
  return clampScore(MAX_SCORE.wordsPerMinute * Math.exp(-distance / WPM_SCORE_FALLOFF), MAX_SCORE.wordsPerMinute);
}

/** The band a WPM falls in. Edges belong to the band nearer the ideal, and WPM is rounded first. */
function band(wpm: number, [slowFrom, idealFrom, idealTo, fastTo]: readonly number[]): PaceBand {
  const v = Math.round(wpm);
  const index = v < slowFrom ? 0 : v < idealFrom ? 1 : v <= idealTo ? 2 : v <= fastTo ? 3 : 4;
  return BAND_LABELS[index];
}

const clampScore = (score: number, max: number) => Math.min(max, Math.max(0, Math.round(score)));

/** `a / b`, or 0 when there's nothing to divide by. */
const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

/** Counts each distinct value, most frequent first, ties alphabetically. */
function countBy(values: string[]): FillerCount[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
}
