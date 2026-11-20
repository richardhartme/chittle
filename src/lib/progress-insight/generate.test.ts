import { describe, expect, it } from "vitest";
import type { ProgressInsightAssessment } from "./context";
import { buildProgressInsightRequest } from "./generate";

const scores = { structure: 150, conciseness: 120, confidence: 80, pronunciation: 140, fillerRate: 90, pace: 60 };

const assessment = (overrides: Partial<ProgressInsightAssessment> = {}): ProgressInsightAssessment => ({
  date: new Date(Date.UTC(2026, 10, 3, 9)),
  category: "Interview",
  framework: "star",
  total: 640,
  scores,
  areasToImprove: ["Open with your point", "Cut the hedges"],
  ...overrides,
});

const context = {
  assessments: [
    assessment(),
    assessment({
      date: new Date(Date.UTC(2026, 10, 5, 9)),
      category: "Storytelling",
      framework: "story_arc",
      total: 712,
      scores: { ...scores, structure: 210 },
      areasToImprove: ["Land the ending"],
    }),
  ],
  focusVotes: [
    { area: "Cut the hedges", vote: "up" as const },
    { area: "Slow down", vote: "down" as const },
  ],
};

const userMessage = () => buildProgressInsightRequest(context).messages[0].content as string;
const systemPrompt = () => (buildProgressInsightRequest(context).system as { text: string }[]).map((b) => b.text).join("\n");

describe("buildProgressInsightRequest", () => {
  it("asks claude-opus-5-5 for a single insight string as structured output", () => {
    const request = buildProgressInsightRequest(context);

    expect(request.model).toBe("claude-opus-5-5");
    expect(request.output_config.format).toMatchObject({
      type: "json_schema",
      schema: { type: "object", properties: { insight: { type: "string" } }, required: ["insight"] },
    });
  });

  it("gives each assessment's date, category, framework, total and dimension scores, in order", () => {
    const message = userMessage();

    const first = message.indexOf("3 Nov 2026");
    const second = message.indexOf("5 Nov 2026");
    expect(first).toBeGreaterThanOrEqual(0);
    expect(second).toBeGreaterThan(first);
    expect(message).toMatch(/3 Nov 2026.*Interview \(STAR\).*640\/1000/);
    expect(message).toMatch(/5 Nov 2026.*Storytelling \(Story arc\).*712\/1000/);
    expect(message).toContain("Shape 150/250");
    expect(message).toContain("Shape 210/250");
    expect(message).toContain("Fluency 90/150");
    expect(message).toContain("Rhythm 60/100");
  });

  it("gives each assessment's areas to improve and the speaker's focus votes", () => {
    const message = userMessage();

    expect(message).toContain("Open with your point; Cut the hedges");
    expect(message).toContain("Land the ending");
    expect(message).toMatch(/Areas I want to work on:\n- Cut the hedges/);
    expect(message).toMatch(/Feedback I didn't find useful:\n- Slow down/);
  });

  it("asks for one specific, number-backed observation of 1–3 sentences in British English", () => {
    const system = systemPrompt();

    expect(system).toContain("1–3 sentences");
    expect(system).toMatch(/numbers/);
    expect(system).toContain("British English");
    expect(system).toMatch(/categor/);
    expect(system).toMatch(/up-voted|want to work on/);
  });
});
