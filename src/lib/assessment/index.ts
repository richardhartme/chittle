import { after } from "next/server";
import { getProviderKeys } from "@/lib/provider-keys";
import { claimAssessment } from "./claim";
import { runAssessment } from "./run";

export type StartResult = "started" | "already-running" | "missing-keys";

/**
 * Starts assessing a recording in the background, after the response is sent (see ADR 0003). Used by
 * upload, Assess and Retry. Needs both provider keys, and does nothing if an assessment is already running.
 */
export async function startAssessment(recording: { id: string; userId: string }): Promise<StartResult> {
  const { deepgram, anthropic } = await getProviderKeys(recording.userId);
  if (!deepgram || !anthropic) return "missing-keys";

  if (!(await claimAssessment(recording.id))) return "already-running";
  after(() => runAssessment(recording.id, { deepgram, anthropic }));
  return "started";
}
