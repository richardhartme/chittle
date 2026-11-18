"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const POLL_MS = 3000;

/**
 * Watches a running assessment: checks its status every few seconds and refreshes the page
 * (re-rendering the server-side panel) as soon as it changes. Renders nothing.
 */
export function AssessmentPoller({ recordingId, status }: { recordingId: string; status: string }) {
  const router = useRouter();

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await fetch(`/api/recordings/${recordingId}/assessment`, { cache: "no-store" });
        if (res.ok) {
          const latest = (await res.json()) as { status: string };
          if (!stopped && latest.status !== status) {
            stopped = true;
            router.refresh();
            return;
          }
        }
      } catch {
        // A dropped request is retried on the next poll.
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    }

    timer = setTimeout(poll, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [recordingId, status, router]);

  return null;
}
