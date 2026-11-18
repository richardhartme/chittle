import type { TranscriptWord } from "@/db/schema";
import { DIMENSION_KEYS, DIMENSIONS, type DimensionKey } from "./dimensions";
import type { Judgement } from "./judgement";
import { FILLER_TOKENS, fillerRateScore, type FillerCount, type Measurement } from "./measure";

/** At most this many strengths and areas to improve are kept. */
export const MAX_STRENGTHS = 3;
export const MAX_AREAS_TO_IMPROVE = 4;

export type PhraseCount = { phrase: string; count: number };

export type ScoredSubScore = { score: number; feedback: string };

/** The judging step's part of `assessments.result`, after its scores and counts have been checked. */
export type JudgedResult = {
  dimensions: Record<DimensionKey, { summary: string; subScores: Record<string, ScoredSubScore> }>;
  hedges: { total: number; perMinute: number; breakdown: PhraseCount[] };
  /** The measured fillers plus the discourse fillers Claude found, which together set Filler rate. */
  fillers: { total: number; perMinute: number; per100Words: number; breakdown: FillerCount[] };
  redundantPhrases: string[];
  overview: string;
  strengths: string[];
  areasToImprove: string[];
};

export type Scored = { scores: Record<DimensionKey, number>; total: number; judged: JudgedResult };

/**
 * Checks Claude's judgement against the transcript and combines it with the measurement: clamps each
 * judged score to its range, caps hedge and filler counts at the times they really occur, adds the
 * discourse fillers to Filler rate, and sums the dimensions into the total. Pure.
 */
export function scoreJudgement({
  judgement,
  measured,
  words,
  durationSeconds,
}: {
  judgement: Judgement;
  measured: Measurement;
  words: TranscriptWord[];
  durationSeconds: number;
}): Scored {
  const tokens = words.map((w) => normalise(w.word).join(" "));
  const hedges = verify(judgement.hedges, tokens);
  const discourseFillers = verify(judgement.discourseFillers, tokens).filter((f) => !FILLER_TOKENS.has(f.phrase));

  const fillerTotal = measured.fillers.total + sum(discourseFillers.map((f) => f.count));
  const per100Words = ratio(fillerTotal * 100, words.length);
  // Nothing said (fillers aside) scores nothing, as in measure().
  const fillerScore = measured.sentences.words > 0 ? fillerRateScore(per100Words) : 0;

  const measuredScores: Record<string, number> = {
    pronunciationClarity: measured.scores.pronunciation,
    fillerFrequency: fillerScore,
    pauseTiming: measured.subScores.pauseTiming,
    wordsPerMinute: measured.subScores.wordsPerMinute,
  };

  const dimensions = Object.fromEntries(
    DIMENSION_KEYS.map((key) => {
      const { source, subScores } = DIMENSIONS[key];
      const given = judgement[key] as unknown as Record<string, { score?: number; feedback: string }>;
      const scored = Object.fromEntries(
        Object.entries(subScores).map(([subKey, { max }]) => [
          subKey,
          {
            score: source === "judged" ? clamp(given[subKey].score ?? 0, max) : measuredScores[subKey],
            feedback: given[subKey].feedback,
          },
        ]),
      );
      return [key, { summary: judgement[key].summary, subScores: scored }];
    }),
  ) as JudgedResult["dimensions"];

  const scores = Object.fromEntries(
    DIMENSION_KEYS.map((key) => [key, sum(Object.values(dimensions[key].subScores).map((s) => s.score))]),
  ) as Record<DimensionKey, number>;

  return {
    scores,
    total: sum(Object.values(scores)),
    judged: {
      dimensions,
      hedges: {
        total: sum(hedges.map((h) => h.count)),
        perMinute: ratio(sum(hedges.map((h) => h.count)) * 60, durationSeconds),
        breakdown: hedges,
      },
      fillers: {
        total: fillerTotal,
        perMinute: ratio(fillerTotal * 60, durationSeconds),
        per100Words,
        breakdown: byCount([...measured.fillers.breakdown, ...discourseFillers.map((f) => ({ word: f.phrase, count: f.count }))]),
      },
      redundantPhrases: judgement.redundantPhrases,
      overview: judgement.overview,
      strengths: judgement.strengths.slice(0, MAX_STRENGTHS),
      areasToImprove: judgement.areasToImprove.slice(0, MAX_AREAS_TO_IMPROVE),
    },
  };
}

/**
 * Normalises each phrase to lower-case words, merges repeats, and caps each count at the number of
 * times the phrase occurs in the transcript's words. Phrases that never occur are dropped.
 */
function verify(phrases: PhraseCount[], tokens: string[]): PhraseCount[] {
  const claimed = new Map<string, number>();
  for (const { phrase, count } of phrases) {
    const key = normalise(phrase).join(" ");
    if (key) claimed.set(key, (claimed.get(key) ?? 0) + Math.max(0, Math.round(count) || 0));
  }
  return [...claimed]
    .map(([phrase, count]) => ({ phrase, count: Math.min(count, occurrences(phrase.split(" "), tokens)) }))
    .filter((p) => p.count > 0)
    .sort((a, b) => b.count - a.count || a.phrase.localeCompare(b.phrase));
}

/** Lower-case words, with curly apostrophes straightened and other punctuation dropped. */
const normalise = (text: string) =>
  text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9'\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

/** How many times `phrase` occurs in `tokens`, without overlaps. */
function occurrences(phrase: string[], tokens: string[]): number {
  let count = 0;
  for (let i = 0; i + phrase.length <= tokens.length; i++) {
    if (phrase.every((word, j) => tokens[i + j] === word)) {
      count++;
      i += phrase.length - 1;
    }
  }
  return count;
}

/** Merges counts of the same word, most frequent first, ties alphabetically. */
function byCount(counts: FillerCount[]): FillerCount[] {
  const merged = new Map<string, number>();
  for (const { word, count } of counts) merged.set(word, (merged.get(word) ?? 0) + count);
  return [...merged]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
}

const clamp = (score: number, max: number) => (Number.isFinite(score) ? Math.min(max, Math.max(0, Math.round(score))) : 0);
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);
