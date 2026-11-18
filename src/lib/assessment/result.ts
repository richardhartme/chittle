import type { Measurement } from "./measure";

/** What's stored in `assessments.result`. The judging step will add its scores and feedback. */
export type AssessmentResult = { measured: Measurement };
