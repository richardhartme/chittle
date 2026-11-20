import { describe, expect, it } from "vitest";
import { wordsOf } from "@/test/judgement";
import { buildCoachRequest, buildScoringRequest, type JudgeInput } from "./judge";
import { measure } from "./measure";

const words = wordsOf("Um, so I led the migration. We finished two weeks early.");

const input = (overrides: Partial<JudgeInput> = {}): JudgeInput => ({
  topic: "Tell me about a project you are proud of.",
  category: "Interview",
  framework: "star",
  transcript: "Um, so I led the migration. We finished two weeks early.",
  durationSeconds: 75,
  measured: measure(words, 75),
  focusVotes: [],
  ...overrides,
});

type Request = ReturnType<typeof buildScoringRequest>;

const userMessage = (request: Request) => {
  const [message] = request.messages;
  expect(message.role).toBe("user");
  return message.content as string;
};

const systemPrompt = (request: Request) =>
  (request.system as { text: string }[]).map((block) => block.text).join("\n");

describe("buildScoringRequest", () => {
  it("gives Claude the topic, the category and its framework's steps in order", () => {
    const message = userMessage(buildScoringRequest(input()));

    expect(message).toContain("Tell me about a project you are proud of.");
    expect(message).toContain("Interview");
    expect(message).toContain("STAR");
    const steps = ["Situation", "Task", "Action", "Result"].map((step) => message.indexOf(step));
    expect(steps.every((at) => at >= 0)).toBe(true);
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
  });

  it("uses the framework of the recording's category", () => {
    const message = userMessage(buildScoringRequest(input({ category: "Storytelling", framework: "story_arc" })));

    expect(message).toContain("Story arc");
    expect(message).toContain("Turning point");
    expect(message).not.toContain("STAR");
  });

  it("gives Claude the transcript, the duration and the measured metrics and scores", () => {
    const message = userMessage(buildScoringRequest(input()));

    expect(message).toContain("Um, so I led the migration. We finished two weeks early.");
    expect(message).toContain("1:15");
    expect(message).toMatch(/Clarity: 150\/150/);
    expect(message).toMatch(/Fluency: \d+\/150/);
    expect(message).toMatch(/Rhythm: \d+\/100/);
    expect(message).toMatch(/Fillers: 1 \(“um” ×1\)/);
    expect(message).toContain("Active WPM");
    expect(message).toMatch(/Average sentence length: 5 words/);
  });

  it("keeps everything about the recording out of the system prompt, so it can be cached", () => {
    const one = buildScoringRequest(input());
    const other = buildScoringRequest(input({ topic: "Why this role?", category: "Opinion", framework: "prep", transcript: "Other." }));

    expect(one.system).toEqual(other.system);
    expect(systemPrompt(one)).not.toContain("migration");
    expect((one.system as { cache_control?: unknown }[]).at(-1)?.cache_control).toEqual({ type: "ephemeral" });
  });

  it("gives Claude the rubric, with each sub-score's maximum, and the house rules", () => {
    const system = systemPrompt(buildScoringRequest(input()));

    expect(system).toMatch(/Logical sequence \(0–50\)/);
    expect(system).toMatch(/Word choice \(0–70\)/);
    expect(system).toMatch(/Sentence length \(0–60\)/);
    expect(system).toMatch(/Assertiveness \(0–75\)/);
    expect(system).toMatch(/British English/);
    expect(system).toMatch(/accent never lowers a score/i);
    expect(system).toMatch(/quote the speaker's own words/i);
  });

  it("gives Claude the speaker's recent focus votes, grouped up and down, newest first", () => {
    const message = userMessage(
      buildScoringRequest(
        input({
          focusVotes: [
            { area: "Open with your point", vote: "up" },
            { area: "Use fewer statistics", vote: "down" },
            { area: "Cut the hedges", vote: "up" },
            { area: "Smile more", vote: "down" },
          ],
        }),
      ),
    );

    const section = message.match(/<focus_votes>\n([\s\S]*?)\n<\/focus_votes>/)?.[1];
    expect(section).toBe(
      [
        "Areas I want to work on:",
        "- Open with your point",
        "- Cut the hedges",
        "Feedback I didn't find useful:",
        "- Use fewer statistics",
        "- Smile more",
      ].join("\n"),
    );
  });

  it("leaves out a group with no votes, and the section when there are none", () => {
    const upOnly = userMessage(buildScoringRequest(input({ focusVotes: [{ area: "Cut the hedges", vote: "up" }] })));
    const none = userMessage(buildScoringRequest(input()));

    expect(upOnly).toContain("Areas I want to work on:\n- Cut the hedges");
    expect(upOnly).not.toContain("didn't find useful");
    expect(none).not.toContain("<focus_votes>");
  });

  it("tells Claude to keep checking up-voted areas and not to repeat feedback voted down", () => {
    const system = systemPrompt(buildScoringRequest(input()));

    expect(system).toMatch(/areas I want to work on.*keep checking/i);
    expect(system).toMatch(/didn't find useful.*don't repeat/i);
  });
});

describe("buildCoachRequest", () => {
  it("gives Claude the topic, the category, its framework's steps and the transcript", () => {
    const message = userMessage(buildCoachRequest(input()));

    expect(message).toContain("Tell me about a project you are proud of.");
    expect(message).toContain("Interview");
    expect(message).toContain("STAR");
    expect(message).toContain("Um, so I led the migration. We finished two weeks early.");
  });

  it("asks for the ideal version with one entry for each of the framework's steps, in order", () => {
    const star = userMessage(buildCoachRequest(input()));
    const storyArc = userMessage(buildCoachRequest(input({ category: "Storytelling", framework: "story_arc" })));

    expect(star).toMatch(/ideal version.*one entry for each step, in this order: Situation, Task, Action, Result\./i);
    expect(storyArc).toMatch(
      /ideal version.*one entry for each step, in this order: Setup, Conflict, Turning point, Resolution, Lesson\./i,
    );
  });

  it("tells Claude to quote only sentences that were spoken in Shorter ways, and to keep the speaker's facts", () => {
    const system = systemPrompt(buildCoachRequest(input()));

    expect(system).toMatch(/shorter ways.*exactly as it appears in the transcript/i);
    expect(system).toMatch(/ideal version.*don't invent/i);
  });

  it("asks only for the coach insights, apart from the scoring, so neither schema is too large to compile", () => {
    const coach = buildCoachRequest(input()).output_config.format.schema.properties as Record<string, unknown>;
    const scoring = buildScoringRequest(input()).output_config.format.schema.properties as Record<string, unknown>;

    expect(Object.keys(coach)).toEqual(
      expect.arrayContaining(["summary", "howYouSaidIt", "betterOrder", "tryOpeningWith", "shorterWays", "idealVersion"]),
    );
    expect(coach).not.toHaveProperty("structure");
    expect(scoring).toHaveProperty("structure");
    expect(scoring).not.toHaveProperty("coachInsights");
    expect(scoring).not.toHaveProperty("idealVersion");
  });
});
