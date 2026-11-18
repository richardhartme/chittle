import type { DimensionKey } from "@/lib/assessment/dimensions";
import { SENTENCE_LENGTH_BANDS, type Measurement } from "@/lib/assessment/measure";
import type { JudgedResult } from "@/lib/assessment/score";
import { formatDuration } from "@/lib/format";
import { Bar } from "./score-parts";

const oneDecimal = (n: number) => (Math.round(n * 10) / 10).toString();
const whole = (n: number) => Math.round(n).toString();
/** Phrases are stored lower case, so "I" is capitalised again for display. */
const quoted = (phrase: string) => `“${phrase.replace(/\bi\b/g, "I")}”`;

/** The statistics shown in a dimension's drawer (SPEC → Assessment → Statistics). Structure has none. */
export function DimensionStats({
  dimension,
  measured,
  judged,
  durationSeconds,
}: {
  dimension: DimensionKey;
  measured: Measurement;
  judged?: JudgedResult;
  durationSeconds: number;
}) {
  const duration = formatDuration(Math.round(durationSeconds));
  if (dimension === "conciseness") {
    const { sentences } = measured;
    const redundant = judged?.redundantPhrases ?? [];
    return (
      <Statistics>
        <dl className="stats">
          <Stat label="Words" value={sentences.words.toString()} />
          <Stat label="Sentences" value={sentences.sentences.toString()} />
          <Stat label="Average length" value={`${oneDecimal(sentences.averageLength)} words`} />
          <Stat label="Long sentences" value={sentences.longSentences.toString()} />
          <Stat label="Redundant phrases" value={redundant.length.toString()} />
        </dl>
        {redundant.length > 0 && (
          <ul className="phrases" aria-label="Redundant phrases">
            {redundant.map((phrase) => (
              <li key={phrase}>{quoted(phrase)}</li>
            ))}
          </ul>
        )}
        <SentenceLengthBand average={sentences.averageLength} band={sentences.averageBand} />
      </Statistics>
    );
  }
  if (dimension === "confidence" && judged) {
    const { hedges } = judged;
    return (
      <Statistics>
        <dl className="stats">
          <Stat label="Hedges" value={hedges.total.toString()} />
          <Stat label="Per minute" value={oneDecimal(hedges.perMinute)} />
          <Stat label="Duration" value={duration} />
        </dl>
        <Breakdown label="Hedge phrases" counts={hedges.breakdown.map(({ phrase, count }) => ({ label: phrase, count }))} />
      </Statistics>
    );
  }
  if (dimension === "fillerRate") {
    // The judged counts include the discourse fillers Claude found; before judging there are only the measured ones.
    const fillers = judged?.fillers ?? measured.fillers;
    return (
      <Statistics>
        <dl className="stats">
          <Stat label="Fillers" value={fillers.total.toString()} />
          <Stat label="Per minute" value={oneDecimal(fillers.perMinute)} />
          <Stat label="Duration" value={duration} />
        </dl>
        <Breakdown label="Filler words" counts={fillers.breakdown.map(({ word, count }) => ({ label: word, count }))} />
      </Statistics>
    );
  }
  if (dimension === "pronunciation") {
    const { clarity, flagged } = measured.pronunciation;
    return (
      <Statistics>
        <dl className="stats">
          <Stat label="Clarity" value={`${Math.round(clarity * 100)}%`} />
          <Stat label="Flagged words" value={flagged.length.toString()} />
        </dl>
        {flagged.length > 0 && (
          <ul className="phrases" aria-label="Flagged words">
            {flagged.map(({ word, start }) => (
              <li key={`${word}-${start}`}>{word}</li>
            ))}
          </ul>
        )}
      </Statistics>
    );
  }
  if (dimension === "pace") {
    // The banded scales and charts come with the pace charts.
    const { average, standardDeviation, range } = measured.pace.overTime;
    return (
      <Statistics>
        <dl className="stats">
          <Stat label="Average WPM" value={whole(average)} />
          <Stat label="Standard deviation" value={`±${whole(standardDeviation)} WPM`} />
          <Stat label="Range" value={`${whole(range[0])}–${whole(range[1])} WPM`} />
        </dl>
      </Statistics>
    );
  }
  return null;
}

/** A bar for each phrase, its length relative to the most frequent. The count is written beside it. */
function Breakdown({ label, counts }: { label: string; counts: { label: string; count: number }[] }) {
  if (counts.length === 0) return null;
  const most = Math.max(...counts.map((c) => c.count));
  return (
    <ul className="breakdown" aria-label={label}>
      {counts.map(({ label, count }) => (
        <li key={label}>
          <span className="breakdown-label">{quoted(label)}</span>
          <Bar value={count} max={most} />
          <span className="breakdown-count">{count}</span>
        </li>
      ))}
    </ul>
  );
}

function Statistics({ children }: { children: React.ReactNode }) {
  return (
    <section className="stack" aria-labelledby="statistics-title">
      <h3 id="statistics-title">Statistics</h3>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** The sentence-length bar runs to this many words, so the "Too long" band has some width. */
const BAND_SCALE_WORDS = 40;
const { idealTo, longTo } = SENTENCE_LENGTH_BANDS;
const BANDS = [
  { band: "Ideal", label: `${idealTo} or fewer`, from: 0, to: idealTo },
  { band: "Long", label: `${idealTo + 1}–${longTo}`, from: idealTo, to: longTo },
  { band: "Too long", label: `over ${longTo}`, from: longTo, to: BAND_SCALE_WORDS },
] as const;

/** The three average sentence length bands, with a marker at the average. */
function SentenceLengthBand({ average, band }: { average: number; band: Measurement["sentences"]["averageBand"] }) {
  const range = BANDS.find((b) => b.band === band)!.label;
  const at = (words: number) => `${(Math.min(words, BAND_SCALE_WORDS) / BAND_SCALE_WORDS) * 100}%`;
  return (
    <div
      className="band-bar"
      role="img"
      aria-label={`Average sentence length: ${oneDecimal(average)} words, in the ${band} band (${range})`}
    >
      <div className="band-bar-track">
        {BANDS.map((b) => (
          <span key={b.band} className={`band ${b.band === band ? "current" : ""}`} style={{ width: at(b.to - b.from) }} />
        ))}
        <span className="band-marker" style={{ left: at(average) }} />
      </div>
      <div className="band-bar-labels" aria-hidden="true">
        {BANDS.map((b) => (
          <span key={b.band} style={{ width: at(b.to - b.from) }}>
            {b.band} <span className="muted">({b.label})</span>
          </span>
        ))}
      </div>
    </div>
  );
}
