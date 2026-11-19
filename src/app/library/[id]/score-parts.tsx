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

export type ChangeDirection = "up" | "down" | "same";

export function changeDirection(change: number): ChangeDirection {
  return change > 0 ? "up" : change < 0 ? "down" : "same";
}

const SIGNS: Record<ChangeDirection, string> = { up: "+", down: "−", same: "±" };

/** A change in score with its sign, such as "+81", "−12" or "±0". */
export function formatChange(change: number): string {
  return `${SIGNS[changeDirection(change)]}${Math.abs(change)}`;
}

/** A score's change since the previous attempt, coloured up or down. */
export function ScoreChange({ change, children }: { change: number; children: React.ReactNode }) {
  return <span className={`score-change ${changeDirection(change)}`}>{children}</span>;
}
