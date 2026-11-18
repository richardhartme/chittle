import { DIMENSION_KEYS, DIMENSIONS, MAX_TOTAL, type DimensionKey } from "@/lib/assessment/dimensions";

const TICKS = [0, 250, 500, 750, 1000];

/** Each dimension's segment of the composition bar, as a percentage of its width, in display order. */
export function compositionSegments(scores: Record<DimensionKey, number>) {
  return DIMENSION_KEYS.map((key) => ({ key, score: scores[key], width: (scores[key] / MAX_TOTAL) * 100 }));
}

/** The score out of 1000, with a bar showing each dimension's share of it. The unscored rest is hatched. */
export function ScoreComposition({ total, scores }: { total: number; scores: Record<DimensionKey, number> }) {
  const segments = compositionSegments(scores);
  const label = `Score composition: ${segments.map(({ key, score }) => `${DIMENSIONS[key].name} ${score}`).join(", ")}, out of ${MAX_TOTAL}.`;
  return (
    <section className="card stack score-composition" aria-labelledby="score-heading">
      <h2 id="score-heading" className="score">
        <span className="sr-only">Score </span>
        <strong>{total}</strong>
        <span className="muted">/{MAX_TOTAL}</span>
      </h2>
      <div>
        <div className="composition-bar" role="img" aria-label={label}>
          {segments.map(({ key, score, width }) => (
            <span
              key={key}
              className={`composition-segment ${key}`}
              style={{ width: `${width}%` }}
              title={`${DIMENSIONS[key].name}: ${score}`}
            />
          ))}
        </div>
        <ol className="composition-ticks" aria-hidden="true">
          {TICKS.map((tick) => (
            <li key={tick} style={{ left: `${(tick / MAX_TOTAL) * 100}%` }}>
              {tick}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
