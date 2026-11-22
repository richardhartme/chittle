"use client";

import { useId, useRef, useState } from "react";

import { DimensionIcon } from "@/components/dimension-icons";
import { DIMENSION_GROUPS, DIMENSION_KEYS, DIMENSIONS, type DimensionKey } from "@/lib/assessment/dimensions";
import { measuredSubScores, type Measurement } from "@/lib/assessment/measure";
import type { JudgedResult } from "@/lib/assessment/score";

import { DimensionStats } from "./dimension-stats";
import { DrawerCloseButton, useDrawer } from "./drawer";
import { PaceChip } from "./pace-charts";
import { Bar, changeDirection, formatChange, ScoreChange, ScoreOutOf } from "./score-parts";

type Scores = Record<DimensionKey, number | null>;

type Props = {
  scores: Scores;
  /** The previous attempt's scores, when this is a retake. Each card shows its change against them. */
  previousScores?: Scores | null;
  measured: Measurement;
  judged?: JudgedResult;
  durationSeconds: number;
};

/**
 * A card for each dimension's score, under the two group headings. Each opens a drawer with the dimension's summary, sub-scores and
 * statistics. Assessments from before judging (no `judged`) have the measured dimensions only.
 */
export function DimensionCards(props: Props) {
  const { scores, previousScores, judged } = props;
  const keys = judged ? DIMENSION_KEYS : DIMENSION_KEYS.filter((key) => DIMENSIONS[key].source === "measured");
  const cards = useRef<Partial<Record<DimensionKey, HTMLButtonElement | null>>>({});
  const drawer = useDrawer<DimensionKey>((dimension) => cards.current[dimension]?.focus());
  const open = drawer.value;

  return (
    <>
      <div className="dimension-groups">
        {DIMENSION_GROUPS.map(({ title, keys: groupKeys }) => {
          const shown = groupKeys.filter((key) => keys.includes(key));
          if (shown.length === 0) return null;
          return (
            <section key={title} className="dimension-group" aria-label={title}>
              <h2 className="dimension-group-title">{title}</h2>
              <ul className="dimension-cards">
                {shown.map((key) => (
                  <li key={key}>
                    <button
                      type="button"
                      ref={(el) => {
                        cards.current[key] = el;
                      }}
                      className={`card dimension-card ${key}`}
                      aria-haspopup="dialog"
                      onClick={() => drawer.open(key)}
                    >
                      <DimensionIcon dimension={key} />
                      <span className="dimension-card-name">{DIMENSIONS[key].name}</span>
                      <ScoreOutOf score={scores[key]} max={DIMENSIONS[key].max} as="span" />
                      <CardChange score={scores[key]} previous={previousScores?.[key] ?? null} />
                      <svg className="chevron" aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
                        <path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <dialog {...drawer.dialogProps} className={`drawer ${open ?? ""}`} aria-labelledby="drawer-title">
        {open && <Drawer dimension={open} {...props} onClose={drawer.close} />}
      </dialog>
    </>
  );
}

const ARROWS = { up: "▲", down: "▼", same: "" };

/** The change in a card's score since the previous attempt. Nothing when either attempt has no score. */
function CardChange({ score, previous }: { score: number | null; previous: number | null }) {
  if (score === null || previous === null) return null;
  const change = score - previous;
  const arrow = ARROWS[changeDirection(change)];
  return (
    <>
      {" "}
      <ScoreChange change={change}>
        {arrow && <span aria-hidden="true">{arrow} </span>}
        {formatChange(change)}{" "}
        <span className="sr-only">since your previous attempt</span>
      </ScoreChange>
    </>
  );
}

function Drawer({ dimension, scores, measured, judged, durationSeconds, onClose }: Props & { dimension: DimensionKey; onClose: () => void }) {
  const { name, description, max } = DIMENSIONS[dimension];
  const score = scores[dimension];
  return (
    <div className="drawer-body stack">
      <header className="drawer-header">
        <DimensionIcon dimension={dimension} />
        <div>
          <h2 id="drawer-title">{name}</h2>
          <p className="muted">{description}</p>
        </div>
        <DrawerCloseButton onClick={onClose} />
      </header>

      <div>
        <div className="drawer-score">
          <ScoreOutOf score={score} max={max} />
          {dimension === "pace" && <PaceChip band={measured.pace.activeBand} />}
        </div>
        <Bar value={score ?? 0} max={max} />
      </div>
      {judged && <p>{judged.dimensions[dimension].summary}</p>}

      <section className="stack">
        <h3 id="breakdown-title">Scoring breakdown</h3>
        <ul className="sub-scores" aria-labelledby="breakdown-title">
          {subScoresOf(dimension, measured, judged).map((sub) => (
            <li key={sub.key} className="stack">
              <div className="sub-score-header">
                <h4>{sub.name}</h4>
                <ScoreOutOf score={sub.score} max={sub.max} />
              </div>
              <p className="muted">{sub.description}</p>
              <Bar value={sub.score} max={sub.max} />
              {sub.feedback && <FeedbackToggle feedback={sub.feedback} />}
            </li>
          ))}
        </ul>
      </section>

      <DimensionStats dimension={dimension} measured={measured} judged={judged} durationSeconds={durationSeconds} />
    </div>
  );
}

type SubScoreView = { key: string; name: string; description: string; max: number; score: number; feedback?: string };

/**
 * The dimension's sub-scores with their descriptions. Without `judged` (assessments from before
 * judging) the measured sub-scores come from the measurement, and there's no feedback.
 */
function subScoresOf(dimension: DimensionKey, measured: Measurement, judged?: JudgedResult): SubScoreView[] {
  const fromMeasurement: Record<string, number> = measuredSubScores(measured);
  return Object.entries(DIMENSIONS[dimension].subScores).map(([key, sub]) => {
    const scored = judged?.dimensions[dimension].subScores[key];
    return {
      key,
      name: sub.name,
      description: "rubric" in sub ? sub.rubric : sub.description,
      max: sub.max,
      score: scored?.score ?? fromMeasurement[key] ?? 0,
      feedback: scored?.feedback,
    };
  });
}

function FeedbackToggle({ feedback }: { feedback: string }) {
  const [shown, setShown] = useState(false);
  const id = useId();
  return (
    <div>
      <button type="button" className="link-button" aria-expanded={shown} aria-controls={id} onClick={() => setShown(!shown)}>
        {shown ? "Hide feedback" : "View feedback"}
      </button>
      <p id={id} className="sub-score-feedback" hidden={!shown}>
        {feedback}
      </p>
    </div>
  );
}
