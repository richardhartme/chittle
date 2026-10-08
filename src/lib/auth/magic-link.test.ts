import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { magicLinks, users } from "@/db/schema";
import { db, resetDb } from "@/test/db";

vi.mock("@/db", async () => ({ db: (await import("@/test/db")).db }));
vi.mock("./email", () => ({ sendMagicLinkEmail: vi.fn().mockResolvedValue(undefined) }));

import { sendMagicLinkEmail } from "./email";
import { consumeMagicLink, normaliseEmail, requestMagicLink } from "./magic-link";
import { hashToken } from "./tokens";

beforeEach(async () => {
  await resetDb();
  vi.mocked(sendMagicLinkEmail).mockClear();
  vi.stubEnv("APP_URL", "https://chittle.test");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

/** Requests a link and returns the raw token that was emailed. */
async function requestToken(email = "a@example.com"): Promise<string> {
  await requestMagicLink(email);
  const link = vi.mocked(sendMagicLinkEmail).mock.calls.at(-1)![1];
  return new URL(link).searchParams.get("token")!;
}

describe("normaliseEmail", () => {
  it("trims and lower-cases", () => {
    expect(normaliseEmail("  Ada@Example.COM \n")).toBe("ada@example.com");
  });
});

describe("requestMagicLink", () => {
  it("emails a link built from APP_URL containing the token", async () => {
    await requestMagicLink("a@example.com");

    expect(sendMagicLinkEmail).toHaveBeenCalledTimes(1);
    const [to, link] = vi.mocked(sendMagicLinkEmail).mock.calls[0];
    expect(to).toBe("a@example.com");
    expect(link).toMatch(/^https:\/\/chittle\.test\/auth\/verify\?token=[A-Za-z0-9_-]{43}$/);
  });

  it("stores only the hash of the token, expiring in 15 minutes", async () => {
    const before = Date.now();
    const token = await requestToken();

    const [row] = await db.select().from(magicLinks);
    expect(row.tokenHash).toBe(hashToken(token));
    expect(row.tokenHash).not.toBe(token);
    expect(row.email).toBe("a@example.com");
    expect(row.consumedAt).toBeNull();
    expect(row.expiresAt.getTime() - before).toBeGreaterThanOrEqual(15 * 60 * 1000 - 1000);
    expect(row.expiresAt.getTime() - before).toBeLessThanOrEqual(15 * 60 * 1000 + 5000);
  });

  it("issues a distinct token per request", async () => {
    const first = await requestToken();
    const second = await requestToken();
    expect(first).not.toBe(second);
    expect(await db.select().from(magicLinks)).toHaveLength(2);
  });
});

describe("consumeMagicLink", () => {
  it("creates the account on first use", async () => {
    const token = await requestToken("new@example.com");

    const user = await consumeMagicLink(token);

    expect(user).toMatchObject({ email: "new@example.com" });
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it("signs in the existing account on later use", async () => {
    const first = await consumeMagicLink(await requestToken("a@example.com"));
    const second = await consumeMagicLink(await requestToken("a@example.com"));

    expect(second?.id).toBe(first?.id);
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it("marks the link as consumed and refuses a second use", async () => {
    const token = await requestToken();

    expect(await consumeMagicLink(token)).not.toBeNull();
    expect(await consumeMagicLink(token)).toBeNull();

    const [row] = await db.select().from(magicLinks);
    expect(row.consumedAt).toBeInstanceOf(Date);
  });

  it("only lets one of several concurrent attempts succeed", async () => {
    const token = await requestToken();
    const results = await Promise.all(Array.from({ length: 5 }, () => consumeMagicLink(token)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it("rejects an unknown token without creating an account", async () => {
    await requestToken();
    expect(await consumeMagicLink("not-a-real-token")).toBeNull();
    expect(await consumeMagicLink("")).toBeNull();
    expect(await db.select().from(users)).toHaveLength(0);
  });

  it("rejects an expired token", async () => {
    const token = await requestToken();
    await db
      .update(magicLinks)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(magicLinks.tokenHash, hashToken(token)));

    expect(await consumeMagicLink(token)).toBeNull();
    expect(await db.select().from(users)).toHaveLength(0);
  });

  it("rejects a token once its 15 minutes have passed", async () => {
    const token = await requestToken();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 16 * 60 * 1000);
    // The expiry check also uses the DB-bound Date, so this exercises the real boundary.
    expect(await consumeMagicLink(token)).toBeNull();
  });
});
