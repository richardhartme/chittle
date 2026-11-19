/** An error as one line for the logs, with the given secrets (such as provider keys) stripped out. */
export function redactForLogs(err: unknown, secrets: string[]): string {
  const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return secrets.reduce((out, secret) => (secret ? out.replaceAll(secret, "[redacted]") : out), text);
}
