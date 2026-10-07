import { and, eq, gt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { env } from "@/lib/env";
import { generateToken, hashToken } from "./tokens";

const COOKIE_NAME = "chittle_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function createSession(userId: string): Promise<void> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ userId, tokenHash: hashToken(token), expiresAt });

  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProduction,
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  cookieStore.delete(COOKIE_NAME);
}

/** The signed-in user for this request, or null. Memoised per request. */
export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;

  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, sql`now()`)));
  return row?.user ?? null;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
