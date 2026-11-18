"use client";

import { useId, useRef, useState } from "react";
import { DIMENSION_KEYS, DIMENSIONS, type DimensionKey } from "@/lib/assessment/dimensions";
import { measuredSubScores, type Measurement } from "@/lib/assessment/measure";
import type { JudgedResult } from "@/lib/assessment/score";
import { DimensionIcon } from "./dimension-icons";
import { DimensionStats } from "./dimension-stats";
import { DrawerCloseButton, useDrawer } from "./drawer";
import { Bar, ScoreOutOf } from "./score-parts";

type Scores = Record<DimensionKey, number | null>;

type Props = { scores: Scores; measured: Measurement; judged?: JudgedResult; durationSeconds: number };

/**
 * A card for each dimension's score. Each opens a drawer with the dimension's summary, sub-scores and
 * statistics. Assessments from before judging (no `judged`) have the measured dimensions only.
 */
export function DimensionCards(props: Props) {
  const { scores, judged } = props;
  const keys = judged ? DIMENSION_KEYS : DIMENSION_KEYS.filter((key) => DIMENSIONS[key].source === "measured");
  const cards = useRef<Partial<Record<DimensionKey, HTMLButtonElement | null>>>({});
  const drawer = useDrawer<DimensionKey>((dimension) => cards.current[dimension]?.focus());
  const open = drawer.value;

  return (
    <>
      <ul className="dimension-cards" aria-label="Dimension scores">
        {keys.map((key) => (
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
              <svg className="chevron" aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
                <path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </li>
        ))}
      </ul>

      <dialog {...drawer.dialogProps} className={`drawer ${open ?? ""}`} aria-labelledby="drawer-title">
        {open && <Drawer dimension={open} {...props} onClose={drawer.close} />}
      </dialog>
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
        <ScoreOutOf score={score} max={max} />
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
