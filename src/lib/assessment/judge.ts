import Anthropic, { AuthenticationError } from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { formatDuration } from "@/lib/format";
import { FRAMEWORKS, type FrameworkId } from "@/lib/frameworks";
import { DIMENSIONS } from "./dimensions";
import { AssessmentError } from "./errors";
import { judgementSchema, type Judgement } from "./judgement";
import type { Measurement } from "./measure";

/** Fixed, so assessments stay comparable. Changing it means bumping the scoring version. */
export const JUDGE_MODEL = "claude-opus-5-5";
/** Opus 5.5 defaults to medium; judging an answer against a rubric is worth the deeper thinking. */
export const JUDGE_EFFORT = "high";
/** Large enough that a long answer's feedback is never cut off, so the request streams. */
const MAX_TOKENS = 64_000;
/** Lets the API re-run a declined request on a fallback model it picks by the refusal's category. */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
/**
 * Shorter than the 5 minutes after which a pending assessment counts as stale, so a slow request is
 * recorded as failed rather than outliving its claim. With no automatic retries for the same reason:
 * the speaker can press Retry.
 */
const TIMEOUT_MS = 4 * 60 * 1000;

export type JudgeInput = {
  topic: string;
  category: string;
  framework: FrameworkId;
  transcript: string;
  durationSeconds: number;
  measured: Measurement;
};

const format = betaZodOutputFormat(judgementSchema);

const rubric = (["structure", "conciseness", "confidence"] as const)
  .map((key) => {
    const { name, max, subScores } = DIMENSIONS[key];
    const lines = Object.values(subScores).map((s) => `- ${s.name} (0–${s.max}): ${s.rubric}`);
    return `${name} (${max} in total):\n${lines.join("\n")}`;
  })
  .join("\n\n");

const SYSTEM_PROMPT = `You are a speaking coach assessing a recording of someone answering an impromptu speaking topic. You receive the transcript, the topic, its category and the framework answers in that category are judged against, and metrics measured from the transcript's word timings and recognition confidence.

Score the judged dimensions against this rubric, giving each sub-score a whole number from 0 to its maximum:

${rubric}

Judge Structure against the category's framework: say which steps the answer covered, in what order, and which were missing. A strong answer needn't name the steps, but it should take them in order.

Scoring guidance:
- Use the whole range. Around 60% of a sub-score's maximum is a typical first attempt, 80% is strong, and full marks are for answers you couldn't improve.
- Judge what was said. Don't reward length for its own sake.
- Pronunciation, Filler rate and Pace are measured from the transcript's words and timings, and already scored. Don't rescore them; explain their results to the speaker in plain terms.
- The transcript comes from speech recognition, so ignore transcription errors and missing punctuation.
- Accent never lowers a score. Pronunciation measures how clearly words were heard, not how they sound.

Feedback:
- Write in British English, speaking to the speaker as "you".
- Quote the speaker's own words to show what you mean.
- Be specific and encouraging, but honest: name the most useful change plainly.
- Strengths and areas to improve are short phrases, not sentences.
- List hedges, discourse fillers and redundant phrases only as they appear in the transcript, and count only the times they were used that way.

Coach insights rework the speaker's own answer, so they can see a better version of it:
- How you said it: the answer's main points in the order they were made. Better order: the same points in the order that would land best, with a paragraph on why.
- Try opening with: one strong first sentence, built from what the speaker went on to say.
- Shorter ways: pick the wordiest sentences. Give each original exactly as it appears in the transcript, word for word, and a shorter version that keeps its meaning.
- Ideal version: the speaker's answer rewritten to follow the category's framework, in their own voice. Keep their facts and examples, and don't invent new ones; where they skipped a step, write it from what they did say.`;

const oneDecimal = (n: number) => (Math.round(n * 10) / 10).toString();
const whole = (n: number) => Math.round(n).toString();

function metrics(measured: Measurement): string {
  const { pace, fillers, pronunciation, sentences, scores, subScores } = measured;
  const fillerList = fillers.breakdown.map(({ word, count }) => `“${word}” ×${count}`).join(", ");
  return [
    `Pronunciation: ${scores.pronunciation}/${DIMENSIONS.pronunciation.max}. Clarity ${whole(pronunciation.clarity * 100)}%, ${pronunciation.flagged.length} unclear words${pronunciation.flagged.length ? ` (${pronunciation.flagged.map((w) => `“${w.word}”`).join(", ")})` : ""}.`,
    `Filler rate: ${scores.fillerRate}/${DIMENSIONS.fillerRate.max}. Fillers: ${fillers.total}${fillerList ? ` (${fillerList})` : ""}, ${oneDecimal(fillers.perMinute)} per minute, ${oneDecimal(fillers.per100Words)} per 100 words. Discourse fillers you find will be added to this.`,
    `Pace: ${scores.pace}/${DIMENSIONS.pace.max} (Pause timing ${subScores.pauseTiming}/${DIMENSIONS.pace.subScores.pauseTiming.max}, Words per minute ${subScores.wordsPerMinute}/${DIMENSIONS.pace.subScores.wordsPerMinute.max}). Active WPM ${whole(pace.activeWpm)} (${pace.activeBand}; 180–220 is ideal), Overall WPM ${whole(pace.overallWpm)} (${pace.overallBand}), ${pace.hesitationZones.length} hesitations mid-sentence, ${pace.rushZones.length} rushed and ${pace.dragZones.length} dragging stretches.`,
    `Sentences: ${sentences.sentences}, ${sentences.words} words. Average sentence length: ${oneDecimal(sentences.averageLength)} words (${sentences.averageBand}), ${sentences.longSentences} over 30 words.`,
  ].join("\n");
}

function userMessage(input: JudgeInput): string {
  const framework = FRAMEWORKS[input.framework];
  const steps = framework.steps.map((step, i) => `${i + 1}. ${step.label}: ${step.description}`).join("\n");
  return `<topic>${input.topic}</topic>
<category>${input.category}</category>
<framework name="${framework.name}">
${steps}
</framework>
<duration>${formatDuration(Math.round(input.durationSeconds))}</duration>
<measured>
${metrics(input.measured)}
</measured>
<transcript>
${input.transcript}
</transcript>
Write the ideal version in ${framework.name}, with one entry for each step, in this order: ${framework.steps.map((step) => step.label).join(", ")}.`;
}

/**
 * The request asking Claude to judge a recording. The system prompt is the same for every recording,
 * so it's cached; everything about the recording is in the user message.
 */
export function buildJudgeRequest(input: JudgeInput) {
  return {
    model: JUDGE_MODEL,
    max_tokens: MAX_TOKENS,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    // The schema alone, without the helper's parse hook: the stream would otherwise parse on its own
    // and throw on a refusal's partial output before stop_reason could be checked.
    output_config: { effort: JUDGE_EFFORT, format: { type: format.type, schema: format.schema } },
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userMessage(input) }],
  } satisfies MessageCreateParamsNonStreaming;
}

/**
 * Asks Claude, with the speaker's key, to judge a recording. A rejected key or a declined assessment
 * throws an `AssessmentError`; anything else throws as it is, for the caller's generic message.
 */
export async function judge(input: JudgeInput, anthropicKey: string): Promise<Judgement> {
  const client = new Anthropic({ apiKey: anthropicKey, timeout: TIMEOUT_MS, maxRetries: 0 });
  let message;
  try {
    message = await client.beta.messages.stream(buildJudgeRequest(input)).finalMessage();
  } catch (err) {
    if (err instanceof AuthenticationError) throw new AssessmentError("Anthropic rejected the key.");
    throw err;
  }
  // With fallbacks, a refusal here means every model in the chain declined.
  if (message.stop_reason === "refusal") throw new AssessmentError("The assessment was declined.");
  if (message.stop_reason !== "end_turn") throw new Error(`Claude stopped early: ${message.stop_reason}`);
  const text = message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
  return format.parse(text);
}
