"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { recordingRatings, recordings, users } from "@/db/schema";
import { consumeMagicLink, normaliseEmail, requestMagicLink } from "@/lib/auth/magic-link";
import { createSession, destroySession, requireUser } from "@/lib/auth/session";
import { getStorage } from "@/lib/storage";

export type FormState = { error?: string; sent?: boolean; saved?: boolean } | undefined;

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

const ratingValue = z.coerce.number().int().min(1).max(5);
const ratingSchema = z.object({
  recordingId: z.uuid(),
  clarity: ratingValue,
  confidence: ratingValue,
  structure: ratingValue,
  pacing: ratingValue,
  bodyLanguage: ratingValue,
  note: z.string().max(5000),
});

export async function saveRating(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const parsed = ratingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Please rate every criterion from 1 to 5." };
  const { recordingId, ...values } = parsed.data;

  const [owned] = await db
    .select({ id: recordings.id })
    .from(recordings)
    .where(and(eq(recordings.id, recordingId), eq(recordings.userId, user.id)));
  if (!owned) return { error: "Recording not found." };

  await db
    .insert(recordingRatings)
    .values({ recordingId, ...values })
    .onConflictDoUpdate({ target: recordingRatings.recordingId, set: { ...values, updatedAt: new Date() } });
  return { saved: true };
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
  await db.delete(users).where(eq(users.id, user.id)); // cascades to sessions, recordings, ratings, seen topics
  await destroySession();
  redirect("/");
}
