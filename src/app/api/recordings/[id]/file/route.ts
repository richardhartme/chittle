import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { recordings } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { getStorage } from "@/lib/storage";

/** Parses a single `bytes=start-[end]` range. Returns null if absent or unsupported (e.g. suffix ranges). */
function parseRange(header: string | null): { start: number; end?: number } | null {
  const match = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || !match[1]) return null;
  return { start: Number(match[1]), end: match[2] ? Number(match[2]) : undefined };
}

export async function GET(request: Request, ctx: RouteContext<"/api/recordings/[id]/file">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorised", { status: 401 });

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });

  // Scoped to the owner, so another user's recording is indistinguishable from a missing one.
  const [recording] = await db
    .select()
    .from(recordings)
    .where(and(eq(recordings.id, id), eq(recordings.userId, user.id)));
  if (!recording) return new Response("Not found", { status: 404 });

  const range = parseRange(request.headers.get("range"));
  const headers = new Headers({
    "Content-Type": recording.mimeType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
  });

  try {
    const object = await getStorage().get(recording.storageKey, range ?? undefined);
    headers.set("Content-Length", String(object.end - object.start + 1));
    if (!range) return new Response(object.stream, { headers });

    headers.set("Content-Range", `bytes ${object.start}-${object.end}/${object.size}`);
    return new Response(object.stream, { status: 206, headers });
  } catch (err) {
    if (err instanceof RangeError) {
      headers.set("Content-Range", `bytes */${recording.sizeBytes}`);
      return new Response(null, { status: 416, headers });
    }
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return new Response("Not found", { status: 404 });
    throw err;
  }
}
