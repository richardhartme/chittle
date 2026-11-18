import { MAX_TOTAL } from "@/lib/assessment/dimensions";

/** The recording's score out of 1000, with the overview, strengths and areas to improve. */
export function OverallResult({
  total,
  overview,
  strengths,
  areasToImprove,
}: {
  total: number;
  overview: string;
  strengths: string[];
  areasToImprove: string[];
}) {
  return (
    <section className="card stack overall-result">
      <p className="score">
        <strong>{total}</strong>
        <span className="muted">/{MAX_TOTAL}</span>
      </p>
      <p>{overview}</p>
      <div className="feedback-lists">
        <div>
          <h2 id="strengths">Strengths</h2>
          <ul aria-labelledby="strengths" className="strengths">
            {strengths.map((strength) => (
              <li key={strength}>
                <span aria-hidden="true">✓</span>
                {strength}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 id="areas-to-improve">Areas to improve</h2>
          <ul aria-labelledby="areas-to-improve">
            {areasToImprove.map((area) => (
              <li key={area}>{area}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
