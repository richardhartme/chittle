import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessage, BetaMessageStreamParams } from "@anthropic-ai/sdk/resources/beta/messages/messages";

/** Lets the API re-run a declined request on a fallback model it picks by the refusal's category. */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/**
 * Streams one structured-output request with the speaker's Anthropic key and resolves with Claude's
 * final message. There are no automatic retries: each attempt is billed to the speaker's key.
 */
export function askClaude(request: BetaMessageStreamParams, anthropicKey: string, timeoutMs: number): Promise<BetaMessage> {
  const client = new Anthropic({ apiKey: anthropicKey, timeout: timeoutMs, maxRetries: 0 });
  return client.beta.messages.stream(request).finalMessage();
}

/** The text of a finished reply, ready to parse against its schema. Throws if Claude stopped early. */
export function replyText(message: BetaMessage): string {
  if (message.stop_reason !== "end_turn") throw new Error(`Claude stopped early: ${message.stop_reason}`);
  return message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
}
