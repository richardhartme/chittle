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

/** Claude's reply to the judging request, as the stream's final message. */
export function claudeReplies(reply: unknown, stop_reason = "end_turn") {
  const text = typeof reply === "string" ? reply : JSON.stringify(reply);
  stream.mockReturnValue({ finalMessage: async () => ({ stop_reason, content: [{ type: "text", text }] }) });
}

export function claudeFails(error: Error) {
  stream.mockReturnValue({ finalMessage: () => Promise.reject(error) });
}
