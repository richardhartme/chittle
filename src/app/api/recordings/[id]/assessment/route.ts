import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { assessments, recordings } from "@/db/schema";
import { assessmentStateColumns, toAssessmentState } from "@/lib/assessment/status";
import { getCurrentUser } from "@/lib/auth/session";

/** The recording's assessment status, polled by the results page while it's pending. */
export async function GET(_request: Request, ctx: RouteContext<"/api/recordings/[id]/assessment">) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Not found" }, { status: 404 });

  // Scoped to the owner, so another speaker's recording looks the same as a missing one.
  const [row] = await db
    .select(assessmentStateColumns)
    .from(recordings)
    .leftJoin(assessments, eq(assessments.recordingId, recordings.id))
    .where(and(eq(recordings.id, id), eq(recordings.userId, user.id)));
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json(toAssessmentState(row), { headers: { "Cache-Control": "private, no-store" } });
}
