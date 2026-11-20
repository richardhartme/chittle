// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { progressInsights } from "@/db/schema";
import { createAssessedRecording, createCategory, createTopic, createUser, db, resetDb } from "@/test/db";

vi.mock("@/db", async () => ({ db: (await import("@/test/db")).db }));
vi.mock("next/server", async () => (await import("@/test/next")).serverMock);

import { ProgressInsightCard } from "./progress-insight-card";

const now = new Date(Date.UTC(2026, 10, 19, 12));
let userId: string;
let topicId: string;

beforeEach(async () => {
  await resetDb();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  userId = (await createUser()).id;
  topicId = (await createTopic((await createCategory()).id)).id;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ProgressInsightCard", () => {
  it("shows the speaker's progress insight and when it was updated", async () => {
    await createAssessedRecording(userId, topicId);
    await createAssessedRecording(userId, topicId);
    await db.insert(progressInsights).values({
      userId,
      text: "Your Structure is up 50 points over your last three practices.",
      generatedAt: new Date(now.getTime() - 3 * 3600 * 1000),
    });

    render(await ProgressInsightCard({ userId }));

    expect(screen.getByRole("heading", { name: "Coach's insight" })).toBeInTheDocument();
    expect(screen.getByText("Your Structure is up 50 points over your last three practices.")).toBeInTheDocument();
    expect(screen.getByText(/^Updated/)).toHaveTextContent("Updated 3 hours ago");
  });

  it("says insights come after a couple of practices when the speaker has fewer than two assessments", async () => {
    await createAssessedRecording(userId, topicId);

    render(await ProgressInsightCard({ userId }));

    expect(screen.getByRole("heading", { name: "Coach's insight" })).toBeInTheDocument();
    expect(screen.getByText("Your coach's insight appears after two assessed practices.")).toBeInTheDocument();
    expect(screen.queryByText(/^Updated/)).not.toBeInTheDocument();
  });

  it("shows only the speaker's own insight", async () => {
    await createAssessedRecording(userId, topicId);
    await createAssessedRecording(userId, topicId);
    const other = await createUser();
    await db.insert(progressInsights).values({ userId: other.id, text: "Someone else's insight." });

    render(await ProgressInsightCard({ userId }));

    expect(screen.queryByText("Someone else's insight.")).not.toBeInTheDocument();
    expect(screen.getByText("Your coach's insight appears after your next practice.")).toBeInTheDocument();
  });
});
