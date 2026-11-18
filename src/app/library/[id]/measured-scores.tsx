import { MAX_SCORE, type Measurement } from "@/lib/assessment/measure";

type Scores = { pace: number | null; fillerRate: number | null; pronunciation: number | null };

const wpm = (n: number) => Math.round(n).toString();
const oneDecimal = (n: number) => (Math.round(n * 10) / 10).toString();

/**
 * Score cards for the measured dimensions, each with its key numbers. The scores come from the
 * assessment's columns, which the judging step may adjust, and the numbers from the stored measurement.
 */
export function MeasuredScores({ scores, measured }: { scores: Scores; measured: Measurement }) {
  const { pace, fillers, pronunciation } = measured;
  return (
    <ul className="score-cards" aria-label="Measured scores">
      <ScoreCard name="Pace" tone="pace" score={scores.pace} max={MAX_SCORE.pace}>
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
      </ScoreCard>

      <ScoreCard name="Filler rate" tone="filler" score={scores.fillerRate} max={MAX_SCORE.fillerRate}>
        <Stat label="Fillers" value={fillers.total.toString()} />
        <Stat label="Per minute" value={oneDecimal(fillers.perMinute)} />
        <Stat label="Per 100 words" value={oneDecimal(fillers.per100Words)} />
        {fillers.breakdown.length > 0 && (
          <Stat label="Most used" value={fillers.breakdown.map(({ word, count }) => `“${word}” ×${count}`).join(", ")} />
        )}
      </ScoreCard>

      <ScoreCard name="Pronunciation" tone="pronunciation" score={scores.pronunciation} max={MAX_SCORE.pronunciation}>
        <Stat label="Clarity" value={`${Math.round(pronunciation.clarity * 100)}%`} />
        <Stat label="Unclear words" value={pronunciation.flagged.length.toString()} />
      </ScoreCard>
    </ul>
  );
}

function ScoreCard({
  name,
  tone,
  score,
  max,
  children,
}: {
  name: string;
  tone: "pace" | "filler" | "pronunciation";
  score: number | null;
  max: number;
  children: React.ReactNode;
}) {
  return (
    <li className={`card score-card ${tone}`}>
      <h3>{name}</h3>
      <p className="score">
        <strong>{score ?? "–"}</strong>
        <span className="muted">/{max}</span>
      </p>
      <dl>{children}</dl>
    </li>
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
