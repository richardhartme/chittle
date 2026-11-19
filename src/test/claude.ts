import { vi } from "vitest";
import { judgementFixture } from "./judgement";

/**
 * A stand-in for the Anthropic SDK's judging call (`client.beta.messages.stream(...).finalMessage()`),
 * keeping the SDK's real error classes. Use from a `vi.mock` factory:
 *
 *   vi.mock("@anthropic-ai/sdk", async (importOriginal) => (await import("@/test/claude")).anthropicMock(importOriginal));
 *
 * It replies with `judgementFixture()` until told otherwise.
 */
export const stream = vi.fn();

export async function anthropicMock(importOriginal: () => Promise<unknown>) {
  claudeReplies(judgementFixture());
  return {
    ...(await importOriginal() as object),
    default: vi.fn(function (this: { beta: unknown }) {
      this.beta = { messages: { stream } };
    }),
  };
}

const replyOf = (reply: unknown, stop_reason: string) => {
  const text = typeof reply === "string" ? reply : JSON.stringify(reply);
  return { finalMessage: async () => ({ stop_reason, content: [{ type: "text", text }] }) };
};

/** Claude's reply to every request, as the stream's final message. */
export function claudeReplies(reply: unknown, stop_reason = "end_turn") {
  stream.mockReturnValue(replyOf(reply, stop_reason));
}

export function claudeFails(error: Error) {
  stream.mockReturnValue({ finalMessage: () => Promise.reject(error) });
}

/**
 * Claude's replies to the next requests, one each, in order: a reply, or an `Error` for a request that
 * fails. Later requests get the reply set by `claudeReplies`.
 */
export function claudeRepliesInTurn(...replies: unknown[]) {
  for (const reply of replies) {
    stream.mockReturnValueOnce(
      reply instanceof Error ? { finalMessage: () => Promise.reject(reply) } : replyOf(reply, "end_turn"),
    );
  }
}
