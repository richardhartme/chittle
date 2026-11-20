import { prerender } from "react-dom/static";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { createCategory, createRecording, createTopic, createUser, resetDb } from "@/test/db";

vi.mock("@/db", async () => ({ db: (await import("@/test/db")).db }));
vi.mock("next/server", async () => (await import("@/test/next")).serverMock);
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));

import Home from "./page";

let user: User;
let topicId: string;

beforeEach(async () => {
  await resetDb();
  user = await createUser();
  topicId = (await createTopic((await createCategory()).id)).id;
  vi.mocked(getCurrentUser).mockResolvedValue(user);
});

/** The signed-in home page as HTML, with everything it suspends on rendered. */
async function dashboard(): Promise<string> {
  const { prelude } = await prerender(await Home({ params: Promise.resolve({}), searchParams: Promise.resolve({}) }));
  return new Response(prelude).text();
}

describe("the dashboard", () => {
  it("shows the coach's insight card, saying insights come later, when nothing is assessed yet", async () => {
    await createRecording(user.id, topicId);

    const html = await dashboard();

    expect(html).toContain("Coach&#x27;s insight");
    expect(html).toContain("Your coach&#x27;s insight appears after two assessed practices.");
  });

  it("leaves the coach's insight card out before the first recording", async () => {
    const html = await dashboard();

    expect(html).toContain("Record your first practice");
    expect(html).not.toContain("Coach&#x27;s insight");
  });
});
