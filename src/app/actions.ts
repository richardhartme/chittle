"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { provider, recordings, users } from "@/db/schema";
import { startAssessment } from "@/lib/assessment";
import { consumeMagicLink, normaliseEmail, requestMagicLink } from "@/lib/auth/magic-link";
import { createSession, destroySession, requireUser } from "@/lib/auth/session";
import * as providerKeyStore from "@/lib/provider-keys";
import { getStorage } from "@/lib/storage";

export type FormState = { error?: string; sent?: boolean } | undefined;

export async function requestLoginLink(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = z.email().safeParse(normaliseEmail(String(formData.get("email") ?? "")));
  if (!email.success) return { error: "Enter a valid email address." };

  try {
    await requestMagicLink(email.data);
  } catch (err) {
    console.error("Failed to send magic link", err);
    return { error: "We couldn't send your sign-in link. Please try again." };
  }
  return { sent: true };
}

export async function verifyLoginLink(formData: FormData) {
  const user = await consumeMagicLink(String(formData.get("token") ?? ""));
  if (!user) redirect("/login?error=invalid");

  await createSession(user.id);
  redirect("/practice");
}

export async function logout() {
  await destroySession();
  redirect("/");
}

export type ProviderKeyState = { error?: string; saved?: boolean } | undefined;

const providerSchema = z.enum(provider.enumValues);

export async function saveProviderKey(_prev: ProviderKeyState, formData: FormData): Promise<ProviderKeyState> {
  const user = await requireUser();
  const which = providerSchema.safeParse(formData.get("provider"));
  if (!which.success) return { error: "Unknown provider." };
  const key = String(formData.get("key") ?? "").trim();
  if (!key) return { error: "Paste a key to save." };

  const result = await providerKeyStore.saveProviderKey(user.id, which.data, key);
  if ("error" in result) return result;
  refresh();
  return { saved: true };
}

export async function removeProviderKey(formData: FormData) {
  const user = await requireUser();
  const which = providerSchema.safeParse(formData.get("provider"));
  if (!which.success) return;

  // Scoped to the signed-in user, so nobody can remove another speaker's key.
  await providerKeyStore.removeProviderKey(user.id, which.data);
  refresh();
}

/**
 * Assess (an unassessed recording), Retry (a failed or stalled one) and Re-assess (a done one, from its
 * stored transcript) all start an assessment.
 */
export async function assessRecording(formData: FormData) {
  const user = await requireUser();
  const id = z.uuid().safeParse(formData.get("recordingId"));
  if (!id.success) return;

  // Scoped to the signed-in user, so nobody can spend another speaker's keys.
  const [recording] = await db
    .select({ id: recordings.id, userId: recordings.userId })
    .from(recordings)
    .where(and(eq(recordings.id, id.data), eq(recordings.userId, user.id)));
  if (!recording) return;

  await startAssessment(recording);
  refresh();
}

export async function deleteRecording(formData: FormData) {
  const user = await requireUser();
  const id = z.uuid().safeParse(formData.get("recordingId"));
  if (!id.success) redirect("/library");

  const [recording] = await db
    .select()
    .from(recordings)
    .where(and(eq(recordings.id, id.data), eq(recordings.userId, user.id)));

  if (recording) {
    // File first: a failure leaves the row (and so the recording) intact and retryable.
    await getStorage().delete(recording.storageKey);
    await db.delete(recordings).where(eq(recordings.id, recording.id));
  }
  redirect("/library");
}

export async function deleteAccount(formData: FormData) {
  const user = await requireUser();
  if (formData.get("confirm") !== user.email) redirect("/account?error=confirm");

  await getStorage().deletePrefix(user.id);
  await db.delete(users).where(eq(users.id, user.id)); // cascades to sessions, recordings, seen topics, provider keys
  await destroySession();
  redirect("/");
}
