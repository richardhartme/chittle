import { useId } from "react";

import { useWidth } from "@/components/use-width";
import {
  ACTIVE_WPM_BANDS,
  DRAG_FACTOR,
  FLUENT_SEGMENT_MIN_WORDS,
  IDEAL_ACTIVE_WPM,
  LONG_GAP_SECONDS,
  OVERALL_WPM_BANDS,
  RUSH_FACTOR,
  WINDOW_SECONDS,
  ZONE_MIN_WORDS,
  type Measurement,
  type PaceBand,
  type Segment,
} from "@/lib/assessment/measure";

import { bandScale, linearScale, smoothPath, timeTicks, wpmAxis, type Point } from "./pace-chart-geometry";

type Pace = Measurement["pace"];

const whole = (n: number) => Math.round(n).toString();
const count = (n: number, noun: string, plural = `${noun}s`) => (n === 0 ? `no ${plural}` : `${n} ${n === 1 ? noun : plural}`);
const percent = (factor: number) => Math.round(Math.abs(factor - 1) * 100);

/** Each band's colour on the scales (grey at the ends, amber either side of the ideal, green) and its word on the chip. */
const BANDS: Record<PaceBand, { tone: "outer" | "near" | "ideal"; chip: string }> = {
  "Very slow": { tone: "outer", chip: "Slow" },
  Slow: { tone: "near", chip: "Slow" },
  Ideal: { tone: "ideal", chip: "On pace" },
  Fast: { tone: "near", chip: "Fast" },
  "Very fast": { tone: "outer", chip: "Fast" },
};

/** The Pace drawer's chip: Active WPM's band, said plainly. */
export function PaceChip({ band }: { band: PaceBand }) {
  return <span className={`chip ${BANDS[band].tone}`}>{BANDS[band].chip}</span>;
}

/** The banded WPM scales, WPM over time and pace variation (SPEC → Assessment → Statistics). */
export function PaceCharts({ pace }: { pace: Pace }) {
  const [overallIdeal, overallFast] = [OVERALL_WPM_BANDS[1], OVERALL_WPM_BANDS[2]];
  return (
    <>
      <section className="stack" aria-labelledby="wpm-scales-title">
        <h3 id="wpm-scales-title">Words per minute</h3>
        <BandedScale
          name="Active WPM"
          wpm={pace.activeWpm}
          band={pace.activeBand}
          edges={ACTIVE_WPM_BANDS}
          explanation={`Your speed while speaking. It leaves out pauses of ${LONG_GAP_SECONDS} seconds or more. Between ${IDEAL_ACTIVE_WPM.min} and ${IDEAL_ACTIVE_WPM.max} words a minute is easy to follow.`}
        />
        {pace.baselineWpm !== null && pace.baselineBand !== null ? (
          <BandedScale
            name="Baseline WPM"
            wpm={pace.baselineWpm}
            band={pace.baselineBand}
            edges={ACTIVE_WPM_BANDS}
            range={pace.baselineRange ?? undefined}
            explanation={`Your natural pace. It is the median speed of your fluent stretches of speech, which are runs of ${FLUENT_SEGMENT_MIN_WORDS} or more words without a filler. The bracket shows the middle half of those stretches. Rush and drag zones are measured against your baseline.`}
          />
        ) : (
          <p className="muted">There wasn&apos;t enough fluent speech to find your baseline pace.</p>
        )}
        <BandedScale
          name="Overall WPM"
          wpm={pace.overallWpm}
          band={pace.overallBand}
          edges={OVERALL_WPM_BANDS}
          explanation={`Every word across the whole recording, pauses included, so it is lower than Active WPM. Between ${overallIdeal} and ${overallFast} words a minute is ideal.`}
        />
      </section>
      <WpmOverTime pace={pace} />
      <PaceVariation pace={pace} />
    </>
  );
}

const SCALE = { bar: 12, pointer: 7, bracket: 26, gap: 2 } as const;

/**
 * Five bands (very slow and very fast grey, slow and fast amber, the ideal green), a pointer at the
 * value, the band edges and end labels underneath, and an optional bracket above for a range.
 */
function BandedScale({
  name,
  wpm,
  band,
  edges,
  range,
  explanation,
}: {
  name: string;
  wpm: number;
  band: PaceBand;
  edges: readonly number[];
  range?: [number, number];
  explanation: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const id = useId();
  const scale = bandScale(edges);
  const x = (fraction: number) => fraction * width;
  const barTop = (range ? SCALE.bracket : 0) + SCALE.pointer + 3;
  const barBottom = barTop + SCALE.bar;
  const pointer = x(scale.position(wpm));
  const bandIndex = scale.bands.findIndex((b) => b.label === band);
  const bandRange = [`under ${edges[0]}`, `${edges[0]}–${edges[1]}`, `${edges[1]}–${edges[2]}`, `${edges[2]}–${edges[3]}`, `over ${edges[3]}`][bandIndex];
  const title = `${name}: ${whole(wpm)}, ${band}`;
  const summary = [
    `${band} is ${bandRange} WPM, and the ideal is ${edges[1]}–${edges[2]} WPM.`,
    range && `The middle half of your fluent stretches was between ${whole(range[0])} and ${whole(range[1])} WPM.`,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="banded-scale">
      <div className="banded-scale-header">
        <h4>{name}</h4>
        <p>
          <strong>{whole(wpm)}</strong> <span className="muted">WPM · {band}</span>
        </p>
      </div>
      <div ref={ref}>
        <svg
          className="chart"
          role="img"
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-summary`}
          width={width}
          height={barBottom + 34}
          viewBox={`0 0 ${width} ${barBottom + 34}`}
        >
          <title id={`${id}-title`}>{title}</title>
          {range && (
            <g className="scale-bracket">
              <path
                d={`M${x(scale.position(range[0]))},${SCALE.bracket - 4}v-5H${x(scale.position(range[1]))}v5`}
                fill="none"
              />
              <text x={(x(scale.position(range[0])) + x(scale.position(range[1]))) / 2} y={SCALE.bracket - 14} textAnchor="middle">
                {whole(range[0])}–{whole(range[1])}
              </text>
            </g>
          )}
          {scale.bands.map((b, i) => (
            <rect
              key={b.label}
              className={`scale-band ${BANDS[b.label].tone}`}
              x={x(b.from) + (i > 0 ? SCALE.gap / 2 : 0)}
              y={barTop}
              width={Math.max(0, x(b.to) - x(b.from) - (i > 0 && i < 4 ? SCALE.gap : SCALE.gap / 2))}
              height={SCALE.bar}
              rx={4}
            />
          ))}
          <g className="scale-pointer">
            <path d={`M${pointer - 6},${barTop - SCALE.pointer - 2}h12l-6,${SCALE.pointer}z`} />
            <rect x={pointer - 1.5} y={barTop - 2} width={3} height={SCALE.bar + 4} rx={1.5} />
          </g>
          <g className="axis" aria-hidden="true">
            {edges.map((edge) => (
              <text key={edge} x={x(scale.position(edge))} y={barBottom + 14} textAnchor="middle">
                {edge}
              </text>
            ))}
            <text x={0} y={barBottom + 30}>
              Very slow
            </text>
            <text x={width} y={barBottom + 30} textAnchor="end">
              Too fast
            </text>
          </g>
        </svg>
      </div>
      <p id={`${id}-summary`} className="sr-only" aria-hidden="true">
        {summary}
      </p>
      <p className="muted chart-explanation">{explanation}</p>
    </div>
  );
}

const PLOT = { height: 210, top: 22, right: 52, bottom: 26, left: 38 } as const;

/** The plot area's scales and gridlines at a width, shared by WPM over time and pace variation. */
function plotFrame(width: number, endSeconds: number, wpmValues: number[]) {
  const right = width - PLOT.right;
  const bottom = PLOT.height - PLOT.bottom;
  const axis = wpmAxis(wpmValues);
  const x = linearScale([0, endSeconds], [PLOT.left, right]);
  const y = linearScale(axis.domain, [bottom, PLOT.top]);
  const xTicks = timeTicks(endSeconds, Math.max(2, Math.floor((right - PLOT.left) / 56)));
  const grid = (
    <g className="axis" aria-hidden="true">
      {axis.ticks.map((t) => (
        <g key={t}>
          <line className="gridline" x1={PLOT.left} x2={right} y1={y(t)} y2={y(t)} />
          <text x={PLOT.left - 6} y={y(t) + 4} textAnchor="end">
            {t}
          </text>
        </g>
      ))}
      <text x={PLOT.left - 6} y={PLOT.top - 10} textAnchor="end">
        WPM
      </text>
      {xTicks.map((t) => (
        <text key={t} x={x(t)} y={bottom + 18} textAnchor="middle">
          {t}s
        </text>
      ))}
    </g>
  );
  /** Whether a WPM is on the axis: thresholds past `WPM_AXIS_LIMITS` aren't drawn rather than pinned to the edge. */
  const onAxis = (wpm: number | null): wpm is number => wpm !== null && wpm >= axis.domain[0] && wpm <= axis.domain[1];
  return { right, bottom, x, y, grid, onAxis };
}

/** A dashed reference line across the plot, labelled at its right-hand end. */
function ThresholdLine({ className, y, left, right, label }: { className: string; y: number; left: number; right: number; label: string }) {
  return (
    <g className={`threshold ${className}`}>
      <line x1={left} x2={right} y1={y} y2={y} />
      <text x={right + 6} y={y + 4} aria-hidden="true">
        {label}
      </text>
    </g>
  );
}

/** Windowed WPM as a smoothed line against seconds, over the ideal band and the rush and drag thresholds. */
function WpmOverTime({ pace }: { pace: Pace }) {
  const id = useId();
  const { windows, average, range } = pace.overTime;
  const end = windows.at(-1)?.end ?? 0;
  const thresholds = [pace.rushThreshold, pace.dragThreshold].filter((t) => t !== null);
  const [ref, width] = useWidth<HTMLDivElement>();
  if (windows.length === 0) return null;
  const plot = plotFrame(width, end, [...windows.map((w) => w.wpm), IDEAL_ACTIVE_WPM.min, IDEAL_ACTIVE_WPM.max, ...thresholds]);
  const { x, y, right, onAxis } = plot;
  const points: Point[] = windows.map((w) => [x((w.start + w.end) / 2), y(w.wpm)]);
  const last = points[points.length - 1];
  return (
    <section className="stack" aria-labelledby={`${id}-heading`}>
      <h3 id={`${id}-heading`}>WPM over time</h3>
      <div ref={ref}>
        <svg
          className="chart"
          role="img"
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-summary`}
          width={width}
          height={PLOT.height}
          viewBox={`0 0 ${width} ${PLOT.height}`}
        >
          <title id={`${id}-title`}>WPM over time</title>
          <rect
            className="ideal-band"
            x={PLOT.left}
            width={right - PLOT.left}
            y={y(IDEAL_ACTIVE_WPM.max)}
            height={y(IDEAL_ACTIVE_WPM.min) - y(IDEAL_ACTIVE_WPM.max)}
          />
          <text x={right + 6} y={(y(IDEAL_ACTIVE_WPM.min) + y(IDEAL_ACTIVE_WPM.max)) / 2 + 4} aria-hidden="true">
            Ideal
          </text>
          {plot.grid}
          {onAxis(pace.rushThreshold) && <ThresholdLine className="rush" y={y(pace.rushThreshold)} left={PLOT.left} right={right} label="Rush" />}
          {onAxis(pace.dragThreshold) && <ThresholdLine className="drag" y={y(pace.dragThreshold)} left={PLOT.left} right={right} label="Drag" />}
          <path className="wpm-line" d={smoothPath(points)} />
          <circle className="end-dot" cx={last[0]} cy={last[1]} r={4} />
          {windows.map((w) => (
            <rect key={w.start} className="hit" x={x(w.start)} width={x(w.end) - x(w.start)} y={PLOT.top} height={plot.bottom - PLOT.top}>
              <title>{`${whole(w.start)}–${whole(w.end)}s: ${whole(w.wpm)} WPM`}</title>
            </rect>
          ))}
        </svg>
      </div>
      <p id={`${id}-summary`} className="sr-only" aria-hidden="true">
        {`Your pace was between ${whole(range[0])} and ${whole(range[1])} WPM across ${count(windows.length, "window")} of about ${WINDOW_SECONDS} seconds. The average was ${whole(average)} WPM. The ideal is ${IDEAL_ACTIVE_WPM.min}–${IDEAL_ACTIVE_WPM.max} WPM.`}
      </p>
      <p className="muted chart-explanation">
        Your words per minute every {WINDOW_SECONDS} seconds or so. The green band is the ideal {IDEAL_ACTIVE_WPM.min}–{IDEAL_ACTIVE_WPM.max} WPM.
      </p>
    </section>
  );
}

/** Each stretch of speech at its WPM, against the baseline range and the rush and drag thresholds. */
function PaceVariation({ pace }: { pace: Pace }) {
  const id = useId();
  const { segments, baselineWpm, baselineRange, rushThreshold, dragThreshold } = pace;
  const end = segments.at(-1)?.end ?? 0;
  const references = [baselineWpm, ...(baselineRange ?? []), rushThreshold, dragThreshold].filter((v) => v !== null);
  const [ref, width] = useWidth<HTMLDivElement>();
  if (segments.length === 0) return null;
  const plot = plotFrame(width, end, [...segments.map((s) => s.wpm), ...references]);
  const { x, y, right, onAxis } = plot;
  const zone = (s: Segment) =>
    pace.rushZones.some((z) => z.start === s.start) ? "rush" : pace.dragZones.some((z) => z.start === s.start) ? "drag" : "speech";
  const wpms = segments.map((s) => s.wpm);
  const summary = [
    `${count(segments.length, "stretch", "stretches")} of speech`,
    `from ${whole(Math.min(...wpms))} to ${whole(Math.max(...wpms))} WPM`,
    baselineWpm !== null ? `against a baseline of ${whole(baselineWpm)} WPM.` : "with no baseline to compare against.",
    baselineWpm !== null ? `${count(pace.rushZones.length, "rush zone")} and ${count(pace.dragZones.length, "drag zone")}.` : "",
  ].join(" ");
  return (
    <section className="stack" aria-labelledby={`${id}-heading`}>
      <h3 id={`${id}-heading`}>Pace variation</h3>
      <div ref={ref}>
        <svg
          className="chart"
          role="img"
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-summary`}
          width={width}
          height={PLOT.height}
          viewBox={`0 0 ${width} ${PLOT.height}`}
        >
          <title id={`${id}-title`}>Pace variation</title>
          {baselineRange && (
            <rect
              className="baseline-range"
              x={PLOT.left}
              width={right - PLOT.left}
              y={y(baselineRange[1])}
              height={y(baselineRange[0]) - y(baselineRange[1])}
            />
          )}
          {plot.grid}
          {baselineWpm !== null && (
            <g className="baseline">
              <line x1={PLOT.left} x2={right} y1={y(baselineWpm)} y2={y(baselineWpm)} />
              <text x={right + 6} y={y(baselineWpm) + 4} aria-hidden="true">
                Base
              </text>
            </g>
          )}
          {onAxis(rushThreshold) && <ThresholdLine className="rush" y={y(rushThreshold)} left={PLOT.left} right={right} label="Rush" />}
          {onAxis(dragThreshold) && <ThresholdLine className="drag" y={y(dragThreshold)} left={PLOT.left} right={right} label="Drag" />}
          {segments.map((s) => {
            const kind = zone(s);
            return (
              <g key={s.start} className={`segment ${kind}`}>
                <line x1={x(s.start)} x2={x(s.end)} y1={y(s.wpm)} y2={y(s.wpm)} />
                <rect className="hit" x={x(s.start) - 4} width={x(s.end) - x(s.start) + 8} y={y(s.wpm) - 12} height={24}>
                  <title>{`${s.start.toFixed(1)}–${s.end.toFixed(1)}s: ${whole(s.wpm)} WPM, ${s.words} words${kind === "speech" ? "" : `, ${kind} zone`}`}</title>
                </rect>
              </g>
            );
          })}
        </svg>
      </div>
      <p id={`${id}-summary`} className="sr-only" aria-hidden="true">
        {summary}
      </p>
      <ul className="chart-legend" aria-label="Pace variation key">
        <li>
          <span className="key segment speech" aria-hidden="true" /> Stretch of speech
        </li>
        {baselineRange && (
          <li>
            <span className="key baseline-range" aria-hidden="true" /> Baseline range
          </li>
        )}
        {rushThreshold !== null && (
          <li>
            <span className="key segment rush" aria-hidden="true" /> Rush zone
          </li>
        )}
        {dragThreshold !== null && (
          <li>
            <span className="key segment drag" aria-hidden="true" /> Drag zone
          </li>
        )}
        {rushThreshold !== null && (
          <li>
            <span className="key threshold rush" aria-hidden="true" /> Rush threshold
          </li>
        )}
        {dragThreshold !== null && (
          <li>
            <span className="key threshold drag" aria-hidden="true" /> Drag threshold
          </li>
        )}
      </ul>
      {baselineWpm !== null && (
        <p className="muted chart-explanation">
          Stretches of {ZONE_MIN_WORDS} or more words that run more than {percent(RUSH_FACTOR)}% faster than your baseline are rush zones,
          and more than {percent(DRAG_FACTOR)}% slower are drag zones. Shorter stretches are too brief to judge.
        </p>
      )}
    </section>
  );
}
