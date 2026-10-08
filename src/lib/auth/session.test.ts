import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sessions } from "@/db/schema";
import { cookieJar, cookieStore, redirectedTo, resetNextMocks } from "@/test/next";
import { createUser, db, resetDb } from "@/test/db";

vi.mock("@/db", async () => ({ db: (await import("@/test/db")).db }));
vi.mock("next/headers", async () => (await import("@/test/next")).headersMock);
vi.mock("next/navigation", async () => (await import("@/test/next")).navigationMock);

import { createSession, destroySession, getCurrentUser, requireUser } from "./session";
import { hashToken } from "./tokens";

const COOKIE = "chittle_session";

beforeEach(async () => {
  await resetDb();
  resetNextMocks();
});

describe("createSession", () => {
  it("stores a hashed token and sets a matching http-only cookie", async () => {
    const user = await createUser();
    await createSession(user.id);

    const token = cookieJar.get(COOKIE)!.value;
    const [row] = await db.select().from(sessions);
    expect(row.userId).toBe(user.id);
    expect(row.tokenHash).toBe(hashToken(token));
    expect(row.tokenHash).not.toBe(token);

    const options = cookieJar.get(COOKIE)!.options!;
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect((options.expires as Date).getTime()).toBe(row.expiresAt.getTime());
  });

  it("expires after 30 days", async () => {
    const user = await createUser();
    const before = Date.now();
    await createSession(user.id);

    const [row] = await db.select().from(sessions);
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    expect(row.expiresAt.getTime() - before).toBeGreaterThanOrEqual(thirtyDays - 1000);
    expect(row.expiresAt.getTime() - before).toBeLessThanOrEqual(thirtyDays + 5000);
  });

  it("marks the cookie secure only in production", async () => {
    const user = await createUser();

    vi.stubEnv("NODE_ENV", "production");
    await createSession(user.id);
    expect(cookieJar.get(COOKIE)!.options!.secure).toBe(true);

    vi.stubEnv("NODE_ENV", "development");
    await createSession(user.id);
    expect(cookieJar.get(COOKIE)!.options!.secure).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe("getCurrentUser", () => {
  it("returns the user for a valid session cookie", async () => {
    const user = await createUser("a@example.com");
    await createSession(user.id);

    expect(await getCurrentUser()).toMatchObject({ id: user.id, email: "a@example.com" });
  });

  it("returns null without a cookie", async () => {
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns null for an unknown token", async () => {
    cookieJar.set(COOKIE, { value: "bogus" });
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns null once the session has expired", async () => {
    const user = await createUser();
    await createSession(user.id);
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) });

    expect(await getCurrentUser()).toBeNull();
  });

  it("does not accept the stored hash as a token", async () => {
    const user = await createUser();
    await createSession(user.id);
    const [row] = await db.select().from(sessions);
    cookieJar.set(COOKIE, { value: row.tokenHash });

    expect(await getCurrentUser()).toBeNull();
  });
});

describe("requireUser", () => {
  it("returns the signed-in user", async () => {
    const user = await createUser();
    await createSession(user.id);
    expect((await requireUser()).id).toBe(user.id);
  });

  it("redirects to /login when signed out", async () => {
    expect(await redirectedTo(requireUser)).toBe("/login");
  });
});

describe("destroySession", () => {
  it("deletes the session row and clears the cookie", async () => {
    const user = await createUser();
    await createSession(user.id);
    const token = cookieJar.get(COOKIE)!.value;

    await destroySession();

    expect(await db.select().from(sessions).where(eq(sessions.tokenHash, hashToken(token)))).toHaveLength(0);
    expect(cookieStore.delete).toHaveBeenCalledWith(COOKIE);
    expect(cookieJar.has(COOKIE)).toBe(false);
  });

  it("leaves other users' sessions alone", async () => {
    const a = await createUser();
    const b = await createUser();
    await createSession(b.id);
    await createSession(a.id);

    await destroySession();

    const remaining = await db.select().from(sessions);
    expect(remaining.map((s) => s.userId)).toEqual([b.id]);
  });

  it("is harmless when signed out", async () => {
    await expect(destroySession()).resolves.toBeUndefined();
    expect(cookieStore.delete).toHaveBeenCalledWith(COOKIE);
  });
});
