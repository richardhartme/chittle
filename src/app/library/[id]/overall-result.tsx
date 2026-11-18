/** The recording's overview, strengths and areas to improve. */
export function OverallResult({
  overview,
  strengths,
  areasToImprove,
}: {
  overview: string;
  strengths: string[];
  areasToImprove: string[];
}) {
  return (
    <section className="card stack overall-result">
      <h2>Overview</h2>
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
