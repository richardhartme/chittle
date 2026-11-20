import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { z } from "zod";
import { DIMENSION_KEYS, DIMENSIONS, MAX_TOTAL } from "@/lib/assessment/dimensions";
import { askClaude, FALLBACK_BETA, replyText } from "@/lib/claude";
import { focusVotesSection } from "@/lib/focus-votes/prompt";
import { FRAMEWORKS } from "@/lib/frameworks";
import type { ProgressInsightAssessment, ProgressInsightContext } from "./context";

/** The model that writes the progress insight. Not tied to the scoring version, since nothing is scored. */
export const PROGRESS_INSIGHT_MODEL = "claude-opus-5-5";
/** A short reply, but with room for adaptive thinking before it. */
const MAX_TOKENS = 16_000;
/** The assessment is already stored by now, so this only bounds how long the background work runs. */
const TIMEOUT_MS = 2 * 60 * 1000;

const progressInsightSchema = z.object({ insight: z.string() });
const format = betaZodOutputFormat(progressInsightSchema);

const SYSTEM_PROMPT = `You are a speaking coach looking across a speaker's recent practice assessments. Each assessment scored one recorded answer out of ${MAX_TOTAL}, across six dimensions, and listed the areas to improve. You also get the speaker's focus votes on those areas: what they want to work on, and feedback they didn't find useful.

Write one coaching observation of 1–3 sentences, the most useful pattern you can see across the assessments. Back it with the numbers given, for example:
- comparing categories ("your Storytelling answers average 120 more than your Interview ones"),
- a trend in one dimension ("${DIMENSIONS.fillerRate.name} has risen from 60 to 110 over your last four practices"),
- or progress on an area they want to work on.

Guidance:
- Be specific: name the dimension, category or area, and quote the scores that show it. Only use numbers you were given, or ones worked out from them.
- End with what to do next, or what to keep doing, when it fits in the sentences you have.
- Don't dwell on feedback they didn't find useful.
- Write in British English, speaking to the speaker as "you".`;

const date = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function assessmentLine(a: ProgressInsightAssessment, index: number): string {
  const scores = DIMENSION_KEYS.map((key) => `${DIMENSIONS[key].name} ${a.scores[key] ?? "–"}/${DIMENSIONS[key].max}`);
  const lines = [
    `${index + 1}. ${date(a.date)} · ${a.category} (${FRAMEWORKS[a.framework].name}) · ${a.total}/${MAX_TOTAL}`,
    `   ${scores.join(", ")}`,
  ];
  if (a.areasToImprove.length) lines.push(`   Areas to improve: ${a.areasToImprove.join("; ")}`);
  return lines.join("\n");
}

function userMessage({ assessments, focusVotes }: ProgressInsightContext): string {
  return `<assessments>
Oldest first.
${assessments.map(assessmentLine).join("\n")}
</assessments>
${focusVotesSection(focusVotes)}Write the observation.`;
}

/** The request asking Claude for the speaker's progress insight. */
export function buildProgressInsightRequest(context: ProgressInsightContext) {
  return {
    model: PROGRESS_INSIGHT_MODEL,
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
export async function generateProgressInsight(context: ProgressInsightContext, anthropicKey: string): Promise<string> {
  const message = await askClaude(buildProgressInsightRequest(context), anthropicKey, TIMEOUT_MS);
  const insight = format.parse(replyText(message)).insight.trim();
  if (!insight) throw new Error("Claude's insight was empty.");
  return insight;
}
