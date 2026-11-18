import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { recordings, topics } from "@/db/schema";
import { startAssessment } from "@/lib/assessment";
import { getCurrentUser } from "@/lib/auth/session";
import { getStorage } from "@/lib/storage";

const querySchema = z.object({
  topicId: z.uuid(),
  durationSeconds: z.coerce.number().int().min(0),
});

const EXTENSIONS: Record<string, string> = {
  "video/webm": "webm",
  "video/mp4": "mp4",
  "video/x-matroska": "mkv",
  "audio/webm": "webm",
  "audio/mp4": "m4a",
};

/**
 * Uploads a recording. The request body is the raw audio or video stream, its
 * Content-Type is the recorder's MIME type, and metadata travels in the query. If the speaker has
 * saved their provider keys, assessment starts in the background.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const url = new URL(request.url);
  const query = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!query.success) return Response.json({ error: "Invalid recording details" }, { status: 400 });

  const contentType = request.headers.get("content-type") ?? "";
  const mimeType = contentType.split(";")[0].trim().toLowerCase();
  if (!mimeType.startsWith("video/") && !mimeType.startsWith("audio/")) {
    return Response.json({ error: "Recordings must be audio or video" }, { status: 415 });
  }
  if (!request.body) return Response.json({ error: "Empty upload" }, { status: 400 });

  const [topic] = await db.select({ id: topics.id }).from(topics).where(eq(topics.id, query.data.topicId));
  if (!topic) return Response.json({ error: "Unknown topic" }, { status: 400 });

  const id = randomUUID();
  const storageKey = `${user.id}/${id}.${EXTENSIONS[mimeType] ?? "bin"}`;
  const storage = getStorage();

  const sizeBytes = await storage.put(storageKey, request.body);
  if (sizeBytes === 0) {
    await storage.delete(storageKey);
    return Response.json({ error: "Empty upload" }, { status: 400 });
  }

  try {
    await db.insert(recordings).values({
      id,
      userId: user.id,
      topicId: topic.id,
      storageKey,
      mimeType,
      sizeBytes,
      durationSeconds: query.data.durationSeconds,
    });
  } catch (err) {
    await storage.delete(storageKey);
    throw err;
  }

  // The recording is saved either way, so a failure to start assessing mustn't fail the upload.
  try {
    await startAssessment({ id, userId: user.id });
  } catch (err) {
    console.error(`Couldn't start assessing recording ${id}:`, err instanceof Error ? err.message : err);
  }

  return Response.json({ id }, { status: 201 });
}
