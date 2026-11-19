/** A failure whose message is safe to store and show the speaker. Never put a provider key in one. */
export class AssessmentError extends Error {
  override name = "AssessmentError";
}
