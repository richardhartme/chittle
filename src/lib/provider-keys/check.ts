import Anthropic, { APIError } from "@anthropic-ai/sdk";
import type { Provider } from "@/db/schema";

export type KeyCheck = "valid" | "rejected" | "unavailable";

const isRejection = (status: number | undefined) => status === 401 || status === 403;

/**
 * Makes the lightest authenticated call each provider offers, to tell a wrong key apart from a
 * provider that couldn't be reached. Never logs or returns the key.
 */
export async function checkProviderKey(provider: Provider, key: string): Promise<KeyCheck> {
  try {
    if (provider === "deepgram") {
      const res = await fetch("https://api.deepgram.com/v1/projects", {
        headers: { Authorization: `Token ${key}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) return "valid";
      return isRejection(res.status) ? "rejected" : "unavailable";
    }

    await new Anthropic({ apiKey: key, maxRetries: 1, timeout: 10_000 }).models.list({ limit: 1 });
    return "valid";
  } catch (err) {
    return err instanceof APIError && isRejection(err.status) ? "rejected" : "unavailable";
  }
}
