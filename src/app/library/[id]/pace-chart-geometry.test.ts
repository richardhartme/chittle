import { describe, expect, it } from "vitest";
import { ACTIVE_WPM_BANDS, OVERALL_WPM_BANDS } from "@/lib/assessment/measure";
import { bandScale, linearScale, smoothPath, timeTicks, wpmAxis } from "./pace-chart-geometry";

describe("bandScale", () => {
  it("gives the five bands equal widths, with outer bands as wide as their neighbours", () => {
    const scale = bandScale(ACTIVE_WPM_BANDS);

    expect(scale.domain).toEqual([100, 300]);
    expect(scale.bands.map(({ label, from, to }) => [label, from, to])).toEqual([
      ["Very slow", 0, 0.2],
      ["Slow", 0.2, 0.4],
      ["Ideal", 0.4, 0.6],
      ["Fast", 0.6, 0.8],
      ["Very fast", 0.8, 1],
    ]);
  });

  it("puts the pointer exactly on a band edge for a value at that edge", () => {
    const active = bandScale(ACTIVE_WPM_BANDS);
    const overall = bandScale(OVERALL_WPM_BANDS);

    expect(active.position(140)).toBeCloseTo(0.2);
    expect(active.position(180)).toBeCloseTo(0.4);
    expect(active.position(220)).toBeCloseTo(0.6);
    expect(active.position(260)).toBeCloseTo(0.8);
    expect(overall.position(130)).toBeCloseTo(0.4);
    expect(overall.position(160)).toBeCloseTo(0.6);
  });

  it("clamps values beyond the scale to its ends", () => {
    const scale = bandScale(ACTIVE_WPM_BANDS);

    expect(scale.position(0)).toBe(0);
    expect(scale.position(99)).toBe(0);
    expect(scale.position(301)).toBe(1);
    expect(scale.position(520)).toBe(1);
  });
});

describe("linearScale", () => {
  it("maps the domain onto the range, including an inverted range for a y axis", () => {
    const y = linearScale([100, 300], [200, 0]);

    expect(y(100)).toBe(200);
    expect(y(200)).toBe(100);
    expect(y(300)).toBe(0);
  });

  it("clamps values outside the domain to the ends of the range", () => {
    const y = linearScale([100, 300], [200, 0]);

    expect(y(40)).toBe(200);
    expect(y(1000)).toBe(0);
  });
});

/** The path's points: where it starts, then each curve's two control points and end point. */
const pathPoints = (d: string) =>
  [...d.matchAll(/-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?/g)].map(([pair]) => pair.split(",").map(Number) as [number, number]);

describe("smoothPath", () => {
  it("draws nothing for an empty series", () => {
    expect(smoothPath([])).toBe("");
  });

  it("starts at the first point and passes through every point in order", () => {
    const points: [number, number][] = [[0, 100], [10, 50], [20, 60], [30, 0]];

    const drawn = pathPoints(smoothPath(points));

    expect(drawn[0]).toEqual([0, 100]);
    // After the start, every third point is where a curve ends.
    expect(drawn.filter((_, i) => i > 0 && i % 3 === 0)).toEqual(points.slice(1));
  });

  it("never bulges past the points either side, so a flat stretch stays flat", () => {
    const points: [number, number][] = [[0, 100], [10, 50], [20, 50], [30, 0]];

    const drawn = pathPoints(smoothPath(points));

    for (let i = 0; i < points.length - 1; i++) {
      const [, y0] = points[i];
      const [, y1] = points[i + 1];
      const controls = drawn.slice(1 + i * 3, 3 + i * 3);
      for (const [, y] of controls) {
        expect(y).toBeGreaterThanOrEqual(Math.min(y0, y1));
        expect(y).toBeLessThanOrEqual(Math.max(y0, y1));
      }
    }
  });
});

describe("wpmAxis", () => {
  it("rounds out to the nearest 50 WPM either side, with a tick every 50", () => {
    expect(wpmAxis([172, 205, 246])).toEqual({ domain: [150, 250], ticks: [150, 200, 250] });
  });

  it("ticks every 100 when every 50 would crowd the axis", () => {
    expect(wpmAxis([60, 340])).toEqual({ domain: [0, 400], ticks: [0, 100, 200, 300, 400] });
  });

  it("stops at 0 and 400 WPM, so one rushed word can't flatten the rest", () => {
    expect(wpmAxis([-10, 172, 1200]).domain).toEqual([0, 400]);
  });

  it("leaves room around a single value", () => {
    expect(wpmAxis([200]).domain).toEqual([150, 250]);
  });
});

describe("timeTicks", () => {
  it("picks a clean step that gives at most the number of ticks asked for", () => {
    expect(timeTicks(65, 6)).toEqual([0, 15, 30, 45, 60]);
    expect(timeTicks(20, 6)).toEqual([0, 5, 10, 15, 20]);
    expect(timeTicks(180, 4)).toEqual([0, 60, 120, 180]);
  });
});
