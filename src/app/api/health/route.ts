import { sql } from "drizzle-orm";
import { db } from "@/db";

/** Health check for the hosting platform: 200 when the app can reach the database. */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
  } catch {
    return Response.json({ status: "error" }, { status: 503 });
  }
  return Response.json({ status: "ok" });
}
