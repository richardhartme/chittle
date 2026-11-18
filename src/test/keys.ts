import { randomBytes } from "node:crypto";
import { vi } from "vitest";
import { providerKeys, type Provider } from "@/db/schema";
import { encrypt } from "@/lib/crypto";
import { db } from "@/test/db";

/** Saves provider keys for `userId` without checking them with the providers. Sets an ENCRYPTION_KEY if none is set. */
export async function saveTestKeys(
  userId: string,
  keys: Partial<Record<Provider, string>> = { deepgram: "dg-test-key", anthropic: "sk-test-key" },
) {
  if (!process.env.ENCRYPTION_KEY) vi.stubEnv("ENCRYPTION_KEY", randomBytes(32).toString("base64"));
  for (const [provider, key] of Object.entries(keys)) {
    await db.insert(providerKeys).values({
      userId,
      provider: provider as Provider,
      encryptedKey: encrypt(key),
      keyHint: key.slice(-4),
    });
  }
}
