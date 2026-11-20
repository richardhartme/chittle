import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { provider, providerKeys, type Provider } from "@/db/schema";
import { canEncrypt, decrypt, encrypt } from "@/lib/crypto";
import { checkProviderKey } from "./check";

export const providers = provider.enumValues;

/** How each provider is shown to the speaker, and where they create a key. */
export const providerDetails: Record<Provider, { label: string; keysUrl: string }> = {
  deepgram: { label: "Deepgram", keysUrl: "https://console.deepgram.com/" },
  anthropic: { label: "Anthropic", keysUrl: "https://platform.claude.com/settings/keys" },
};

export type SaveResult = { saved: true } | { error: string };

/** Checks a key with its provider and, if it's accepted, stores it encrypted, replacing any earlier one. */
export async function saveProviderKey(userId: string, which: Provider, key: string): Promise<SaveResult> {
  // Checked before the key goes anywhere, so a misconfigured server never sends it to the provider.
  if (!canEncrypt()) {
    return { error: "This server can't save keys because its ENCRYPTION_KEY is missing or invalid." };
  }

  const check = await checkProviderKey(which, key);
  if (check === "rejected") return { error: "The provider rejected that key." };
  if (check === "unavailable") return { error: "Couldn't check the key. Try again." };

  const values = { encryptedKey: encrypt(key), keyHint: key.slice(-4), updatedAt: new Date() };
  await db
    .insert(providerKeys)
    .values({ userId, provider: which, ...values })
    .onConflictDoUpdate({ target: [providerKeys.userId, providerKeys.provider], set: values });
  return { saved: true };
}

export async function removeProviderKey(userId: string, which: Provider): Promise<void> {
  await db.delete(providerKeys).where(and(eq(providerKeys.userId, userId), eq(providerKeys.provider, which)));
}

/** The last four characters of each saved key, safe to show the speaker. */
export async function getProviderKeyHints(userId: string): Promise<Partial<Record<Provider, string>>> {
  const rows = await db
    .select({ provider: providerKeys.provider, keyHint: providerKeys.keyHint })
    .from(providerKeys)
    .where(eq(providerKeys.userId, userId));
  return Object.fromEntries(rows.map((r) => [r.provider, r.keyHint]));
}

/** Decrypted keys, for server-side use only: never send these to the client or write them to logs. */
export async function getProviderKeys(userId: string): Promise<Partial<Record<Provider, string>>> {
  const rows = await db
    .select({ provider: providerKeys.provider, encryptedKey: providerKeys.encryptedKey })
    .from(providerKeys)
    .where(eq(providerKeys.userId, userId));
  return Object.fromEntries(rows.map((r) => [r.provider, decrypt(r.encryptedKey)]));
}

/** True when the speaker has saved every key assessment needs. */
export async function hasProviderKeys(userId: string): Promise<boolean> {
  const hints = await getProviderKeyHints(userId);
  return providers.every((p) => p in hints);
}
