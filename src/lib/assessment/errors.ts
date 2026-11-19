/** A failure whose message is safe to store and show the speaker. Never put a provider key in one. */
export class AssessmentError extends Error {
  override name = "AssessmentError";
}

/** An error as one line for the logs, with the given provider keys stripped out. */
export function forTheLogs(err: unknown, keys: string[]): string {
  const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return keys.reduce((out, key) => (key ? out.replaceAll(key, "[redacted]") : out), text);
}
