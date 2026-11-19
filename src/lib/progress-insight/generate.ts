import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { z } from "zod";
import { DIMENSION_KEYS, DIMENSIONS, MAX_TOTAL } from "@/lib/assessment/dimensions";
import { focusVotesSection, JUDGE_MODEL } from "@/lib/assessment/judge";
import { FRAMEWORKS } from "@/lib/frameworks";
import type { InsightAssessment, InsightContext } from "./context";

/** A short reply, but with room for adaptive thinking before it. */
const MAX_TOKENS = 16_000;
/** The assessment is already stored by now, so this only bounds how long the background work runs. */
const TIMEOUT_MS = 2 * 60 * 1000;
/** Lets the API re-run a declined request on a fallback model it picks by the refusal's category. */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

const insightSchema = z.object({ insight: z.string() });
const format = betaZodOutputFormat(insightSchema);

const SYSTEM_PROMPT = `You are a speaking coach looking across a speaker's recent practice assessments. Each assessment scored one recorded answer out of ${MAX_TOTAL}, across six dimensions, and listed the areas to improve. You also get the speaker's focus votes on those areas: what they want to work on, and feedback they didn't find useful.

Write one coaching observation of 1–3 sentences, the most useful pattern you can see across the assessments. Back it with the numbers given, for example:
- comparing categories ("your Storytelling answers average 120 more than your Interview ones"),
- a trend in one dimension ("Filler rate has risen from 60 to 110 over your last four practices"),
- or progress on an area they want to work on.

Guidance:
- Be specific: name the dimension, category or area, and quote the scores that show it. Only use numbers you were given, or ones worked out from them.
- End with what to do next, or what to keep doing, when it fits in the sentences you have.
- Don't dwell on feedback they didn't find useful.
- Write in British English, speaking to the speaker as "you".`;

const date = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function assessmentLine(a: InsightAssessment, index: number): string {
  const scores = DIMENSION_KEYS.map((key) => `${DIMENSIONS[key].name} ${a.scores[key] ?? "–"}/${DIMENSIONS[key].max}`);
  const lines = [
    `${index + 1}. ${date(a.date)} · ${a.category} (${FRAMEWORKS[a.framework].name}) · ${a.total}/${MAX_TOTAL}`,
    `   ${scores.join(", ")}`,
  ];
  if (a.areasToImprove.length) lines.push(`   Areas to improve: ${a.areasToImprove.join("; ")}`);
  return lines.join("\n");
}

function userMessage({ assessments, focusVotes }: InsightContext): string {
  return `<assessments>
Oldest first.
${assessments.map(assessmentLine).join("\n")}
</assessments>
${focusVotesSection(focusVotes)}Write the observation.`;
}

/** The request asking Claude for the speaker's progress insight. */
export function buildInsightRequest(context: InsightContext) {
  return {
    model: JUDGE_MODEL,
    max_tokens: MAX_TOKENS,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    // The schema alone, as in judging: the reply is parsed once stop_reason has been checked.
    output_config: { format: { type: format.type, schema: format.schema } },
    system: [{ type: "text", text: SYSTEM_PROMPT }],
    messages: [{ role: "user", content: userMessage(context) }],
  } satisfies MessageCreateParamsNonStreaming;
}

/** Asks Claude, with the speaker's key, for their progress insight. Throws on any failure. */
export async function generateInsight(context: InsightContext, anthropicKey: string): Promise<string> {
  const client = new Anthropic({ apiKey: anthropicKey, timeout: TIMEOUT_MS });
  const message = await client.beta.messages.stream(buildInsightRequest(context)).finalMessage();
  if (message.stop_reason !== "end_turn") throw new Error(`Claude stopped early: ${message.stop_reason}`);
  const text = message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
  const insight = format.parse(text).insight.trim();
  if (!insight) throw new Error("Claude's insight was empty.");
  return insight;
}
