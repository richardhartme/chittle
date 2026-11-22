import { randomBytes } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createUser, resetDb } from "@/test/db";

vi.mock("@/db", async () => ({ db: (await import("@/test/db")).db }));
vi.mock("@anthropic-ai/sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@anthropic-ai/sdk")>()),
  default: vi.fn(function (this: { models: { list: () => Promise<unknown> } }) {
    this.models = { list: async () => ({ data: [] }) };
  }),
}));

import { getProviderKeyHints, getProviderKeys, hasProviderKeys, removeProviderKey, saveProviderKey } from ".";

beforeEach(async () => {
  await resetDb();
  vi.stubEnv("ENCRYPTION_KEY", randomBytes(32).toString("base64"));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
});

describe("hasProviderKeys", () => {
  it("is true only once both keys are saved", async () => {
    const { id } = await createUser();
    expect(await hasProviderKeys(id)).toBe(false);

    await saveProviderKey(id, "deepgram", "dg-1111");
    expect(await hasProviderKeys(id)).toBe(false);

    await saveProviderKey(id, "anthropic", "sk-2222");
    expect(await hasProviderKeys(id)).toBe(true);

    await removeProviderKey(id, "anthropic");
    expect(await hasProviderKeys(id)).toBe(false);
  });
});

describe("getProviderKeys and getProviderKeyHints", () => {
  it("return the speaker's own keys, decrypted, and only their last four characters as hints", async () => {
    const me = await createUser();
    const other = await createUser();
    await saveProviderKey(me.id, "deepgram", "dg-mine-1111");
    await saveProviderKey(me.id, "anthropic", "sk-mine-2222");
    await saveProviderKey(other.id, "deepgram", "dg-other-3333");

    expect(await getProviderKeys(me.id)).toEqual({ deepgram: "dg-mine-1111", anthropic: "sk-mine-2222" });
    expect(await getProviderKeyHints(me.id)).toEqual({ deepgram: "1111", anthropic: "2222" });
    expect(await getProviderKeys(other.id)).toEqual({ deepgram: "dg-other-3333" });
  });
});
