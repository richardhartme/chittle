import type { DimensionKey } from "@/lib/assessment/dimensions";

const PATHS: Record<DimensionKey, string> = {
  // Lines of decreasing length: an outline.
  structure: "M4 6h16M4 12h11M4 18h7",
  // Scissors.
  conciseness: "M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.1 7.9 20 20M8.1 16.1 20 4",
  // A flag.
  confidence: "M5 21V4h12l-2.5 4 2.5 4H5",
  // A microphone.
  pronunciation: "M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21",
  // A speech bubble with an ellipsis.
  fillerRate: "M4 5h16v11H9l-5 4zM8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01",
  // A gauge.
  pace: "M4 18a8 8 0 1 1 16 0M12 18l4-6",
};

/** The dimension's icon, in its colour. Decorative: it's always next to the dimension's name. */
export function DimensionIcon({ dimension }: { dimension: DimensionKey }) {
  return (
    <svg className="dimension-icon" aria-hidden="true" viewBox="0 0 24 24" width="24" height="24">
      <path d={PATHS[dimension]} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
