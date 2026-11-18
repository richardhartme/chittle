/** The answer structures a category can be judged against (see SPEC → Topics). */
export const FRAMEWORK_IDS = ["star", "prep", "story_arc", "what_so_what_now_what"] as const;
export type FrameworkId = (typeof FRAMEWORK_IDS)[number];

export type FrameworkStep = { label: string; description: string };
export type Framework = { name: string; steps: FrameworkStep[] };

/** Each framework's name and its steps, in the order an answer should take them. */
export const FRAMEWORKS: Record<FrameworkId, Framework> = {
  star: {
    name: "STAR",
    steps: [
      { label: "Situation", description: "Set the scene: where and when it happened, and who was involved." },
      { label: "Task", description: "What you were responsible for, or the challenge you faced." },
      { label: "Action", description: "The specific steps you took yourself." },
      { label: "Result", description: "What happened in the end, ideally measured, and what you learned." },
    ],
  },
  prep: {
    name: "PREP",
    steps: [
      { label: "Point", description: "State your main point or opinion up front." },
      { label: "Reason", description: "Give the reason you hold it." },
      { label: "Example", description: "Back the reason up with a concrete example." },
      { label: "Point restated", description: "Finish by restating your point, sharpened by what you've said." },
    ],
  },
  story_arc: {
    name: "Story arc",
    steps: [
      { label: "Setup", description: "Introduce the people, the place and what normal looked like." },
      { label: "Conflict", description: "The problem, tension or challenge that disrupted it." },
      { label: "Turning point", description: "The moment things changed." },
      { label: "Resolution", description: "How it was resolved, and how things ended up." },
      { label: "Lesson", description: "What it taught you, or why the story matters." },
    ],
  },
  what_so_what_now_what: {
    name: "What / So what / Now what",
    steps: [
      { label: "What", description: "The facts: what happened or what the subject is." },
      { label: "So what", description: "Why it matters to the listener." },
      { label: "Now what", description: "The next step, recommendation or call to action." },
    ],
  },
};
