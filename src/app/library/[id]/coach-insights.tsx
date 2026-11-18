"use client";

import { useRef } from "react";
import type { CoachInsights } from "@/lib/assessment/score";
import { DrawerCloseButton, useDrawer } from "./drawer";

/**
 * A floating "Coach insights" button that opens a drawer with the coach insights, ending with the
 * ideal version. Assessments from before scoring version 3 have none, so there's no button for them.
 */
export function CoachInsightsDrawer({ insights }: { insights?: CoachInsights }) {
  const button = useRef<HTMLButtonElement>(null);
  const drawer = useDrawer<true>(() => button.current?.focus());

  if (!insights) return null;

  return (
    <>
      <button
        type="button"
        ref={button}
        className="primary coach-insights-button"
        aria-haspopup="dialog"
        onClick={() => drawer.open(true)}
      >
        Coach insights
      </button>

      <dialog {...drawer.dialogProps} className="drawer coach-insights" aria-labelledby="coach-insights-title">
        {drawer.value && <Drawer insights={insights} onClose={drawer.close} />}
      </dialog>
    </>
  );
}

function Drawer({ insights, onClose }: { insights: CoachInsights; onClose: () => void }) {
  const { howYouSaidIt, betterOrder, orderExplanation, tryOpeningWith, shorterWays, idealVersion } = insights;
  return (
    <div className="drawer-body stack">
      <header className="drawer-header">
        <div>
          <h2 id="coach-insights-title">Coach insights</h2>
          <p className="muted">Your own answer, reworked.</p>
        </div>
        <DrawerCloseButton onClick={onClose} />
      </header>

      <Section id="how-you-said-it" title="How you said it">
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
