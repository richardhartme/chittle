import { describe, expect, it } from "vitest";
import { wordsOf } from "@/test/judgement";
import { buildJudgeRequest, type JudgeInput } from "./judge";
import { measure } from "./measure";

const words = wordsOf("Um, so I led the migration. We finished two weeks early.");

const input = (overrides: Partial<JudgeInput> = {}): JudgeInput => ({
  topic: "Tell me about a project you are proud of.",
  category: "Interview",
  framework: "star",
  transcript: "Um, so I led the migration. We finished two weeks early.",
  durationSeconds: 75,
  measured: measure(words, 75),
  ...overrides,
});

const userMessage = (request: ReturnType<typeof buildJudgeRequest>) => {
  const [message] = request.messages;
  expect(message.role).toBe("user");
  return message.content as string;
};

const systemPrompt = (request: ReturnType<typeof buildJudgeRequest>) =>
  (request.system as { text: string }[]).map((block) => block.text).join("\n");

describe("buildJudgeRequest", () => {
  it("gives Claude the topic, the category and its framework's steps in order", () => {
    const message = userMessage(buildJudgeRequest(input()));

    expect(message).toContain("Tell me about a project you are proud of.");
    expect(message).toContain("Interview");
    expect(message).toContain("STAR");
    const steps = ["Situation", "Task", "Action", "Result"].map((step) => message.indexOf(step));
    expect(steps.every((at) => at >= 0)).toBe(true);
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
  });

  it("uses the framework of the recording's category", () => {
    const message = userMessage(buildJudgeRequest(input({ category: "Storytelling", framework: "story_arc" })));

    expect(message).toContain("Story arc");
    expect(message).toContain("Turning point");
    expect(message).not.toContain("STAR");
  });

  it("gives Claude the transcript, the duration and the measured metrics and scores", () => {
    const message = userMessage(buildJudgeRequest(input()));

    expect(message).toContain("Um, so I led the migration. We finished two weeks early.");
    expect(message).toContain("1:15");
    expect(message).toMatch(/Pronunciation: 150\/150/);
    expect(message).toMatch(/Filler rate: \d+\/150/);
    expect(message).toMatch(/Pace: \d+\/100/);
    expect(message).toMatch(/Fillers: 1 \(“um” ×1\)/);
    expect(message).toContain("Active WPM");
    expect(message).toMatch(/Average sentence length: 5 words/);
  });

  it("keeps everything about the recording out of the system prompt, so it can be cached", () => {
    const one = buildJudgeRequest(input());
    const other = buildJudgeRequest(input({ topic: "Why this role?", category: "Opinion", framework: "prep", transcript: "Other." }));

    expect(one.system).toEqual(other.system);
    expect(systemPrompt(one)).not.toContain("migration");
    expect((one.system as { cache_control?: unknown }[]).at(-1)?.cache_control).toEqual({ type: "ephemeral" });
  });

  it("gives Claude the rubric, with each sub-score's maximum, and the house rules", () => {
    const system = systemPrompt(buildJudgeRequest(input()));

    expect(system).toMatch(/Logical sequence \(0–50\)/);
    expect(system).toMatch(/Word choice \(0–70\)/);
    expect(system).toMatch(/Sentence length \(0–60\)/);
    expect(system).toMatch(/Assertiveness \(0–75\)/);
    expect(system).toMatch(/British English/);
    expect(system).toMatch(/accent never lowers a score/i);
    expect(system).toMatch(/quote the speaker's own words/i);
  });
});
