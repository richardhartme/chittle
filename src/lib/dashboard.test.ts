import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DimensionKey } from "@/lib/assessment/dimensions";
import { createAssessedRecording, createCategory, createRecording, createTopic, createUser, resetDb } from "@/test/db";

vi.mock("@/db", async () => ({ db: (await import("@/test/db")).db }));

import { dashboardHref, parseDashboardFilters, scoreHistory } from "./dashboard";

describe("parseDashboardFilters", () => {
  it("defaults to all dimensions and the last 7 practices", () => {
    expect(parseDashboardFilters({})).toEqual({ dimension: "all", range: "7" });
  });

  it("reads a dimension and a range from the query", () => {
    expect(parseDashboardFilters({ dimension: "fillerRate", range: "30" })).toEqual({ dimension: "fillerRate", range: "30" });
    expect(parseDashboardFilters({ dimension: "all", range: "all" })).toEqual({ dimension: "all", range: "all" });
  });

  it("falls back to the defaults for values it doesn't know", () => {
    expect(parseDashboardFilters({ dimension: "volume", range: "90" })).toEqual({ dimension: "all", range: "7" });
    expect(parseDashboardFilters({ dimension: "", range: "" })).toEqual({ dimension: "all", range: "7" });
    expect(parseDashboardFilters({ dimension: "toString", range: "constructor" })).toEqual({ dimension: "all", range: "7" });
  });

  it("falls back for each filter on its own", () => {
    expect(parseDashboardFilters({ dimension: "pace", range: "nope" })).toEqual({ dimension: "pace", range: "7" });
    expect(parseDashboardFilters({ dimension: "nope", range: "all" })).toEqual({ dimension: "all", range: "all" });
  });

  it("ignores repeated parameters rather than picking one", () => {
    expect(parseDashboardFilters({ dimension: ["pace", "structure"], range: ["30", "all"] })).toEqual({ dimension: "all", range: "7" });
  });
});

describe("dashboardHref", () => {
  it("leaves the defaults out of the query string", () => {
    expect(dashboardHref({ dimension: "all", range: "7" })).toBe("/");
    expect(dashboardHref({ dimension: "pace", range: "7" })).toBe("/?dimension=pace");
    expect(dashboardHref({ dimension: "all", range: "all" })).toBe("/?range=all");
    expect(dashboardHref({ dimension: "confidence", range: "30" })).toBe("/?dimension=confidence&range=30");
  });

  it("round-trips through the parser", () => {
    const filters = { dimension: "conciseness", range: "30" } as const;
    const query = Object.fromEntries(new URLSearchParams(dashboardHref(filters).split("?")[1]));
    expect(parseDashboardFilters(query)).toEqual(filters);
  });
});

beforeEach(resetDb);

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

/** Dimension scores totalling 655. */
const SCORES: Record<DimensionKey, number> = { structure: 150, conciseness: 120, confidence: 110, pronunciation: 120, fillerRate: 90, pace: 65 };

async function setup() {
  const user = await createUser();
  const topic = await createTopic((await createCategory()).id);
  /** A recording made `minutes` ago, assessed with these scores and a total of their sum. */
  const practice = (minutes: number, scores = SCORES) =>
    createAssessedRecording(user.id, topic.id, { createdAt: minutesAgo(minutes), scores });
  return { user, topic, practice };
}

describe("scoreHistory", () => {
  it("gives a column per assessed recording, oldest first, and the mean total out of 1000", async () => {
    const { user, practice } = await setup();
    const older = await practice(20, { ...SCORES, structure: 200 }); // 705
    const newer = await practice(10); // 655

    const history = await scoreHistory(user.id, { dimension: "all", range: "7" });

    expect(history.columns).toEqual([
      { recordingId: older.id, createdAt: older.createdAt, total: 705, scores: { ...SCORES, structure: 200 } },
      { recordingId: newer.id, createdAt: newer.createdAt, total: 655, scores: SCORES },
    ]);
    expect(history.average).toEqual({ score: 680, max: 1000 });
  });

  it("averages one dimension out of its maximum when it's selected, rounded to a whole score", async () => {
    const { user, practice } = await setup();
    await practice(30, { ...SCORES, pace: 60 });
    await practice(20, { ...SCORES, pace: 70 });
    await practice(10, { ...SCORES, pace: 81 });

    const history = await scoreHistory(user.id, { dimension: "pace", range: "7" });

    expect(history.average).toEqual({ score: 70, max: 100 });
    expect(history.columns).toHaveLength(3);
  });

  it("covers the last 7, the last 30 or all assessed recordings", async () => {
    const { user, practice } = await setup();
    const made = [];
    for (let minutes = 35; minutes > 0; minutes--) made.push(await practice(minutes));
    const ids = (columns: { recordingId: string }[]) => columns.map((column) => column.recordingId);

    expect(ids((await scoreHistory(user.id, { dimension: "all", range: "7" })).columns)).toEqual(ids(made.slice(-7).map((r) => ({ recordingId: r.id }))));
    expect(ids((await scoreHistory(user.id, { dimension: "all", range: "30" })).columns)).toEqual(ids(made.slice(-30).map((r) => ({ recordingId: r.id }))));
    expect((await scoreHistory(user.id, { dimension: "all", range: "all" })).columns).toHaveLength(35);
  });

  it("orders recordings made at the same moment by id, so the range always picks the same ones", async () => {
    const { user, topic } = await setup();
    const sameMoment = minutesAgo(5);
    const made = [];
    for (let i = 0; i < 12; i++) made.push((await createAssessedRecording(user.id, topic.id, { createdAt: sameMoment })).id);
    const byId = [...made].sort();

    const { columns } = await scoreHistory(user.id, { dimension: "all", range: "7" });

    expect(columns.map((column) => column.recordingId)).toEqual(byId.slice(-7));
  });

  it("averages only the recordings in range", async () => {
    const { user, practice } = await setup();
    await practice(100, { ...SCORES, structure: 0 }); // 505, outside the last 7
    for (let minutes = 7; minutes > 0; minutes--) await practice(minutes); // 655 each

    expect((await scoreHistory(user.id, { dimension: "all", range: "7" })).average).toEqual({ score: 655, max: 1000 });
    expect((await scoreHistory(user.id, { dimension: "all", range: "all" })).average).toEqual({ score: 636, max: 1000 });
  });

  it("leaves out recordings that aren't assessed, are still pending, failed or have no total", async () => {
    const { user, topic, practice } = await setup();
    const assessed = await practice(50);
    await createRecording(user.id, topic.id, { createdAt: minutesAgo(40) });
    await createAssessedRecording(user.id, topic.id, { createdAt: minutesAgo(30), status: "pending" });
    await createAssessedRecording(user.id, topic.id, { createdAt: minutesAgo(20), status: "failed" });
    await createAssessedRecording(user.id, topic.id, { createdAt: minutesAgo(10), totalScore: null }); // scoring version 1

    const history = await scoreHistory(user.id, { dimension: "all", range: "7" });

    expect(history.columns.map((column) => column.recordingId)).toEqual([assessed.id]);
    expect(history.average).toEqual({ score: 655, max: 1000 });
  });

  it("only includes the speaker's own recordings", async () => {
    const { user, topic, practice } = await setup();
    await practice(10);
    const someoneElse = await createUser();
    await createAssessedRecording(someoneElse.id, topic.id, { createdAt: minutesAgo(5), scores: { ...SCORES, pace: 0 } });

    const history = await scoreHistory(user.id, { dimension: "all", range: "all" });

    expect(history.columns).toHaveLength(1);
    expect(history.average).toEqual({ score: 655, max: 1000 });
    expect((await scoreHistory(someoneElse.id, { dimension: "all", range: "all" })).average).toEqual({ score: 590, max: 1000 });
  });

  it("has no average when nothing is assessed", async () => {
    const { user, topic } = await setup();
    await createRecording(user.id, topic.id);

    expect(await scoreHistory(user.id, { dimension: "structure", range: "7" })).toEqual({ columns: [], average: null });
  });
});
