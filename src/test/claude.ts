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

type Reply = { reply: unknown; stop_reason: string } | { error: Error };

/** Claude's reply to every request not answered by a reply in turn. */
let fallback: Reply;
/** Replies for the next requests, in order. */
let inTurn: Reply[] = [];
/** The coach insights of a judgement just used for a scoring request, for the coach request after it. */
let coachInTurn: Reply[] = [];

const hasCoachInsights = (reply: Reply): reply is { reply: { coachInsights: unknown }; stop_reason: string } =>
  "reply" in reply && typeof reply.reply === "object" && reply.reply !== null && "coachInsights" in reply.reply;

const coachOf = (reply: Reply): Reply =>
  hasCoachInsights(reply) ? { reply: reply.reply.coachInsights, stop_reason: reply.stop_reason } : reply;

/** Whether `request` is judging's request for the coach insights, which are asked for on their own. */
const isCoachRequest = (request: { output_config?: { format?: { schema?: { properties?: object } } } }) =>
  "howYouSaidIt" in (request.output_config?.format?.schema?.properties ?? {});

function respond(reply: Reply) {
  if ("error" in reply) return { finalMessage: () => Promise.reject(reply.error) };
  const text = typeof reply.reply === "string" ? reply.reply : JSON.stringify(reply.reply);
  return { finalMessage: async () => ({ stop_reason: reply.stop_reason, content: [{ type: "text", text }] }) };
}

stream.mockImplementation((request) => {
  if (isCoachRequest(request)) return respond(coachInTurn.shift() ?? coachOf(inTurn.shift() ?? fallback));
  const reply = inTurn.shift();
  if (!reply) return respond(fallback);
  if (hasCoachInsights(reply)) coachInTurn.push(coachOf(reply));
  return respond(reply);
});

/**
 * Claude's reply to every request, as the stream's final message. A judgement answers both of judging's
 * requests: the coach request gets its coach insights.
 */
export function claudeReplies(reply: unknown, stop_reason = "end_turn") {
  fallback = { reply, stop_reason };
  inTurn = [];
  coachInTurn = [];
}

export function claudeFails(error: Error) {
  fallback = { error };
  inTurn = [];
  coachInTurn = [];
}

/**
 * Claude's replies to the next requests, one each, in order: a reply, or an `Error` for a request that
 * fails. A judgement answers both of judging's requests, as with `claudeReplies`. Later requests get
 * the reply set by `claudeReplies`.
 */
export function claudeRepliesInTurn(...replies: unknown[]) {
  for (const reply of replies) inTurn.push(reply instanceof Error ? { error: reply } : { reply, stop_reason: "end_turn" });
}
