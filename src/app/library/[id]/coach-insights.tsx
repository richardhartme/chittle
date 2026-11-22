"use client";

import { useId, useRef } from "react";

import type { CoachInsights } from "@/lib/assessment/score";

import { DrawerCloseButton, useDrawer } from "./drawer";

/**
 * A card above the score with the coach's summary, opening a drawer with all the coach insights,
 * ending with the ideal version. Version 3 assessments have no summary, so the card shows the
 * suggested opening instead. Assessments from before version 3 have no coach insights, so no card.
 */
export function CoachInsightsCard({ insights }: { insights?: CoachInsights }) {
  const card = useRef<HTMLButtonElement>(null);
  const drawer = useDrawer<true>(() => card.current?.focus());
  const headingId = useId();
  const summaryId = useId();

  if (!insights) return null;

  return (
    <>
      <button
        type="button"
        ref={card}
        className="card coach-card"
        aria-haspopup="dialog"
        aria-labelledby={headingId}
        aria-describedby={summaryId}
        onClick={() => drawer.open(true)}
      >
        <span id={headingId} className="coach-card-name">
          Coach insights
        </span>
        <svg className="chevron" aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
          <path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span id={summaryId} className="coach-card-summary">
          {insights.summary ?? <>Try opening with: “{insights.tryOpeningWith}”</>}
        </span>
      </button>

      <dialog {...drawer.dialogProps} className="drawer coach-insights" aria-labelledby="coach-insights-title">
        {drawer.value && <Drawer insights={insights} onClose={drawer.close} />}
      </dialog>
    </>
  );
}

function Drawer({ insights, onClose }: { insights: CoachInsights; onClose: () => void }) {
  const { summary, howYouSaidIt, betterOrder, orderExplanation, tryOpeningWith, shorterWays, idealVersion } = insights;
  return (
    <div className="drawer-body stack">
      <header className="drawer-header">
        <div>
          <h2 id="coach-insights-title">Coach insights</h2>
          {summary ? <p>{summary}</p> : <p className="muted">Your own answer, reworked.</p>}
        </div>
        <DrawerCloseButton onClick={onClose} />
      </header>

      <Section id="your-order" title="Your order">
        <ol className="coach-points">
          {howYouSaidIt.map((point, i) => (
            <li key={i}>{point}</li>
          ))}
        </ol>
      </Section>

      <Section id="better-order" title="Better order">
        <ol className="coach-points better">
          {betterOrder.map((point, i) => (
            <li key={i}>{point}</li>
          ))}
        </ol>
        <p className="muted">{orderExplanation}</p>
      </Section>

      <Section id="try-opening-with" title="Try opening with">
        <blockquote className="coach-opening">“{tryOpeningWith}”</blockquote>
      </Section>

      {shorterWays.length > 0 && (
        <Section id="shorter-ways" title="Shorter ways to say it">
          <ul className="coach-shorter-ways">
            {shorterWays.map(({ original, shorter, savedWords }, i) => (
              <li key={i} className="stack">
                <del>{original}</del>
                <p>
                  <span aria-hidden="true">→ </span>
                  {shorter}
                </p>
                <p className="muted">
                  saved {savedWords} {savedWords === 1 ? "word" : "words"}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section id="ideal-version" title="Ideal version">
        {idealVersion.map(({ step, text }, i) => (
          <details key={i} className="coach-ideal-step" open>
            <summary>{step}</summary>
            <p>{text}</p>
          </details>
        ))}
      </Section>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className="stack" aria-labelledby={id}>
      <h3 id={id}>{title}</h3>
      {children}
    </section>
  );
}
