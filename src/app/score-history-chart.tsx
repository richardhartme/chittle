"use client";

import Link from "next/link";
import { useId } from "react";
import { useWidth } from "@/components/use-width";
import { DIMENSIONS } from "@/lib/assessment/dimensions";
import type { DimensionView, ScoreColumn } from "@/lib/dashboard";

/**
 * A column as the chart draws it, with its score in the selected view. The date is formatted on the
 * server, so it matches after hydration.
 */
export type ChartColumn = Omit<ScoreColumn, "createdAt"> & { date: string; value: number };

/** The dimension view without its `value` function, which can't be passed to a client component. */
export type ChartView = Omit<DimensionView, "value">;

const PLOT = { height: 260, top: 12, bottom: 30, left: 40, right: 4 } as const;
const BAR = { maxWidth: 24, gap: 2, radius: 4 } as const;
/** Below this much room per column, the totals underneath would collide, so they're left to the tooltip and table. */
const MIN_LABEL_BAND = 24;

/** A rectangle with its top corners rounded (the data end) and its bottom square (the baseline). */
function roundedTop(x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height);
  return `M${x},${y + height}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}H${x + width - r}A${r},${r} 0 0 1 ${x + width},${y + r}V${y + height}Z`;
}

/**
 * The speaker's assessed recordings over time: one column each, oldest on the left, stacked by
 * dimension against a hatched background as tall as the maximum, with the total underneath. With
 * one dimension selected, just that dimension against its own maximum. Each column links to its results.
 */
export function ScoreHistoryChart({ columns, view: { keys, max, name } }: { columns: ChartColumn[]; view: ChartView }) {
  const id = useId();
  const [ref, width] = useWidth<HTMLDivElement>(640);
  // A breakdown and a total only add anything when more than one dimension is stacked.
  const showsTotal = keys.length > 1;

  const bottom = PLOT.height - PLOT.bottom;
  const y = (score: number) => bottom - (score / max) * (bottom - PLOT.top);
  const band = (width - PLOT.left - PLOT.right) / Math.max(columns.length, 1);
  const barWidth = Math.min(BAR.maxWidth, band * 0.7);
  const ticks = [0, max / 2, max];

  return (
    <div className="stack score-history">
      <div ref={ref}>
        <svg
          className="chart"
          aria-labelledby={`${id}-title`}
          width={width}
          height={PLOT.height}
          viewBox={`0 0 ${width} ${PLOT.height}`}
        >
          <title id={`${id}-title`}>{`${name} for each of your last ${columns.length} assessed practices, out of ${max}`}</title>
          <defs>
            <pattern id={`${id}-hatch`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect className="hatch-ground" width="8" height="8" />
              <rect className="hatch-line" width="4" height="8" />
            </pattern>
          </defs>
          <g className="axis" aria-hidden="true">
            {ticks.map((tick) => (
              <g key={tick}>
                <line className="gridline" x1={PLOT.left} x2={width - PLOT.right} y1={y(tick)} y2={y(tick)} />
                <text x={PLOT.left - 8} y={y(tick) + 4} textAnchor="end">
                  {tick}
                </text>
              </g>
            ))}
          </g>
          {columns.map((column, index) => {
            const centre = PLOT.left + band * (index + 0.5);
            const x = centre - barWidth / 2;
            const scored = keys.filter((key) => column.scores[key] > 0);
            let stacked = 0;
            return (
              <Link
                key={column.recordingId}
                href={`/library/${column.recordingId}`}
                className="score-column"
                aria-label={`${column.date}: ${name.toLowerCase()} ${column.value} out of ${max}. Open results.`}
              >
                <title>
                  {[
                    `${column.date}: ${column.value}/${max}`,
                    ...(showsTotal ? keys.map((key) => `${DIMENSIONS[key].name} ${column.scores[key]}`) : []),
                  ].join("\n")}
                </title>
                <rect className="hit" x={centre - band / 2} width={band} y={PLOT.top} height={PLOT.height - PLOT.top} />
                <path className="score-background" d={roundedTop(x, y(max), barWidth, bottom - y(max), BAR.radius)} fill={`url(#${id}-hatch)`} />
                {scored.map((key, i) => {
                  const from = stacked;
                  stacked += column.scores[key];
                  const top = y(stacked);
                  const isTop = i === scored.length - 1;
                  // A 2px surface gap separates each segment from the one above it.
                  const height = y(from) - top - (isTop ? 0 : BAR.gap);
                  if (height <= 0) return null;
                  const segmentTop = isTop ? top : top + BAR.gap;
                  return isTop ? (
                    <path key={key} className={`score-segment dimension-key ${key}`} d={roundedTop(x, segmentTop, barWidth, height, BAR.radius)} />
                  ) : (
                    <rect key={key} className={`score-segment dimension-key ${key}`} x={x} y={segmentTop} width={barWidth} height={height} />
                  );
                })}
                {band >= MIN_LABEL_BAND && (
                  <text className="score-total" x={centre} y={bottom + 18} textAnchor="middle" aria-hidden="true">
                    {column.value}
                  </text>
                )}
              </Link>
            );
          })}
        </svg>
      </div>
      <ul className="chart-legend" aria-label="Dimensions">
        {keys.map((key) => (
          <li key={key}>
            <span className={`key block dimension-key ${key}`} aria-hidden="true" /> {DIMENSIONS[key].name}
          </li>
        ))}
      </ul>
      <details className="chart-table">
        <summary>Show as a table</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Practice</th>
                {keys.map((key) => (
                  <th key={key} scope="col">
                    {DIMENSIONS[key].name}
                  </th>
                ))}
                {showsTotal && <th scope="col">Total</th>}
              </tr>
            </thead>
            <tbody>
              {columns.map((column) => (
                <tr key={column.recordingId}>
                  <th scope="row">
                    <Link href={`/library/${column.recordingId}`}>{column.date}</Link>
                  </th>
                  {keys.map((key) => (
                    <td key={key}>{column.scores[key]}</td>
                  ))}
                  {showsTotal && <td>{column.total}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
