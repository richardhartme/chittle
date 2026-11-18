import { DIMENSION_KEYS, DIMENSIONS, type DimensionKey } from "@/lib/assessment/dimensions";
import type { Measurement } from "@/lib/assessment/measure";
import type { JudgedResult } from "@/lib/assessment/score";

type Scores = Record<DimensionKey, number | null>;

const TONES: Record<DimensionKey, string> = {
  structure: "structure",
  conciseness: "conciseness",
  confidence: "confidence",
  pronunciation: "pronunciation",
  fillerRate: "filler",
  pace: "pace",
};

const wpm = (n: number) => Math.round(n).toString();
const oneDecimal = (n: number) => (Math.round(n * 10) / 10).toString();

/**
 * A card for each dimension with its score and summary, and the key numbers for the measured ones.
 * Assessments from before judging (no `judged`) show the measured dimensions only.
 */
export function DimensionScores({
  scores,
  measured,
  judged,
}: {
  scores: Scores;
  measured: Measurement;
  judged?: JudgedResult;
}) {
  const keys = judged ? DIMENSION_KEYS : DIMENSION_KEYS.filter((key) => DIMENSIONS[key].source === "measured");
  return (
    <ul className="score-cards" aria-label="Dimension scores">
      {keys.map((key) => (
        <li key={key} className={`card score-card ${TONES[key]}`}>
          <h3>{DIMENSIONS[key].name}</h3>
          <p className="score">
            <strong>{scores[key] ?? "–"}</strong>
            <span className="muted">/{DIMENSIONS[key].max}</span>
          </p>
          {judged && <p>{judged.dimensions[key].summary}</p>}
          <Stats dimension={key} measured={measured} fillers={judged?.fillers ?? measured.fillers} />
        </li>
      ))}
    </ul>
  );
}

function Stats({
  dimension,
  measured,
  fillers,
}: {
  dimension: DimensionKey;
  measured: Measurement;
  fillers: Measurement["fillers"];
}) {
  const { pace, pronunciation } = measured;
  if (dimension === "pace") {
    return (
      <dl>
        <Stat label="Active WPM" value={`${wpm(pace.activeWpm)} · ${pace.activeBand}`} />
        <Stat label="Overall WPM" value={`${wpm(pace.overallWpm)} · ${pace.overallBand}`} />
        <Stat
          label="Baseline WPM"
          value={
            pace.baselineWpm === null || pace.baselineRange === null
              ? "Not enough fluent speech"
              : `${wpm(pace.baselineWpm)} (${wpm(pace.baselineRange[0])}–${wpm(pace.baselineRange[1])})`
          }
        />
        <Stat label="Hesitations" value={pace.hesitationZones.length.toString()} />
      </dl>
    );
  }
  if (dimension === "fillerRate") {
    return (
      <dl>
        <Stat label="Fillers" value={fillers.total.toString()} />
        <Stat label="Per minute" value={oneDecimal(fillers.perMinute)} />
        <Stat label="Per 100 words" value={oneDecimal(fillers.per100Words)} />
        {fillers.breakdown.length > 0 && (
          <Stat label="Most used" value={fillers.breakdown.map(({ word, count }) => `“${word}” ×${count}`).join(", ")} />
        )}
      </dl>
    );
  }
  if (dimension === "pronunciation") {
    return (
      <dl>
        <Stat label="Clarity" value={`${Math.round(pronunciation.clarity * 100)}%`} />
        <Stat label="Unclear words" value={pronunciation.flagged.length.toString()} />
      </dl>
    );
  }
  // The judged dimensions' statistics come with the dimension drawers.
  return null;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
