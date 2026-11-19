import { BAND_LABELS, type PaceBand } from "@/lib/assessment/measure";

export type BandScale = {
  /** The WPM at the scale's two ends. */
  domain: [number, number];
  /** Each band's share of the scale, from 0 (slow end) to 1. */
  bands: { label: PaceBand; from: number; to: number }[];
  /** Where a WPM falls on the scale, from 0 to 1, clamped to the ends. */
  position: (wpm: number) => number;
};

/**
 * A banded WPM scale from the four band edges (slowest first). The outer bands are as wide as their
 * neighbours, so the scale runs one band past each outer edge.
 */
export function bandScale(edges: readonly number[]): BandScale {
  const [slowFrom, idealFrom, idealTo, fastTo] = edges;
  const domain: [number, number] = [slowFrom - (idealFrom - slowFrom), fastTo + (fastTo - idealTo)];
  const position = linearScale(domain, [0, 1]);
  const stops = [domain[0], ...edges, domain[1]].map(position);
  return {
    domain,
    bands: BAND_LABELS.map((label, i) => ({ label, from: stops[i], to: stops[i + 1] })),
    position,
  };
}

/** Maps a value from `domain` to `range` in a straight line, clamped so it never leaves the range. */
export function linearScale([d0, d1]: readonly [number, number], [r0, r1]: readonly [number, number]) {
  return (value: number) => {
    const t = d1 === d0 ? 0 : (value - d0) / (d1 - d0);
    return r0 + Math.min(1, Math.max(0, t)) * (r1 - r0);
  };
}

export type Point = [x: number, y: number];

/**
 * An SVG path through the points (x ascending), smoothed with a monotone cubic curve (as d3's
 * `curveMonotoneX`): it passes through every point and never bulges above or below its neighbours, so a
 * smoothed WPM never shows a peak or dip that wasn't measured. An empty series gives an empty path.
 */
export function smoothPath(points: readonly Point[]): string {
  if (points.length === 0) return "";
  const [first] = points;
  if (points.length === 1) return `M${xy(first)}`;
  const secants = points.slice(1).map(([x, y], i) => ratio(y - points[i][1], x - points[i][0]));
  const tangents = points.map((_, i) => {
    if (i === 0) return secants[0];
    if (i === points.length - 1) return secants[i - 1];
    const [s0, s1] = [secants[i - 1], secants[i]];
    if (s0 * s1 <= 0) return 0;
    const [h0, h1] = [points[i][0] - points[i - 1][0], points[i + 1][0] - points[i][0]];
    const blended = (s0 * h1 + s1 * h0) / (h0 + h1);
    return Math.sign(s0) * 2 * Math.min(Math.abs(s0), Math.abs(s1), Math.abs(blended) / 2);
  });
  const curves = points.slice(1).map(([x1, y1], i) => {
    const [x0, y0] = points[i];
    const third = (x1 - x0) / 3;
    return `C${xy([x0 + third, y0 + tangents[i] * third])} ${xy([x1 - third, y1 - tangents[i + 1] * third])} ${xy([x1, y1])}`;
  });
  return `M${xy(first)}${curves.join("")}`;
}

const round = (n: number) => Math.round(n * 100) / 100;
const xy = ([x, y]: Point) => `${round(x)},${round(y)}`;
const ratio = (a: number, b: number) => (b === 0 ? 0 : a / b);

/** The pace charts' WPM axis never runs past these, so one rushed word can't flatten everything else. */
export const WPM_AXIS_LIMITS = [0, 400] as const;
const MAX_WPM_TICKS = 6;

/**
 * A WPM axis covering the values: rounded out to the nearest 50 either side (or 100, when 50s would
 * give more than `MAX_WPM_TICKS` ticks), within `WPM_AXIS_LIMITS`.
 */
export function wpmAxis(values: readonly number[]): { domain: [number, number]; ticks: number[] } {
  const axis = (step: number) => {
    let lo = Math.floor(Math.min(...values) / step) * step;
    let hi = Math.ceil(Math.max(...values) / step) * step;
    if (lo === hi) [lo, hi] = [lo - step, hi + step];
    [lo, hi] = [Math.max(WPM_AXIS_LIMITS[0], lo), Math.min(WPM_AXIS_LIMITS[1], hi)];
    return { domain: [lo, hi] as [number, number], ticks: stepsBetween(lo, hi, step) };
  };
  const fine = axis(50);
  return fine.ticks.length <= MAX_WPM_TICKS ? fine : axis(100);
}

const TIME_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

/** Ticks from 0 seconds at the smallest clean step that gives no more than `maxTicks`. */
export function timeTicks(endSeconds: number, maxTicks: number): number[] {
  const step = TIME_STEPS.find((s) => Math.floor(endSeconds / s) + 1 <= maxTicks) ?? TIME_STEPS[TIME_STEPS.length - 1];
  return stepsBetween(0, endSeconds, step);
}

/** Multiples of `step` from `lo` to `hi`, both included when they're multiples. */
function stepsBetween(lo: number, hi: number, step: number): number[] {
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);
  return ticks;
}
