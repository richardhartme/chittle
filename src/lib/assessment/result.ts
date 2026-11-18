import type { Measurement } from "./measure";
import type { JudgedResult } from "./score";

/**
 * What's stored in `assessments.result`. Scoring version 1 had the measurement only; from version 2
 * the judging step adds its scores and feedback, and from version 3 the coach insights.
 */
export type AssessmentResult = { measured: Measurement; judged?: JudgedResult };
