/** A score out of its maximum, such as "205/250". An unscored dimension shows a dash. */
export function ScoreOutOf({ score, max, as: Tag = "p" }: { score: number | null; max: number; as?: "p" | "span" }) {
  return (
    <Tag className="score">
      <strong>{score ?? "–"}</strong>
      <span className="muted">/{max}</span>
    </Tag>
  );
}

/** A progress bar. It's decorative: the number it shows is always written next to it. */
export function Bar({ value, max }: { value: number; max: number }) {
  return (
    <span className="bar" aria-hidden="true">
      <span style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
    </span>
  );
}
