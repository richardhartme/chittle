import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { magicLinks, users } from "@/db/schema";
import { env } from "@/lib/env";
import { sendMagicLinkEmail } from "./email";
import { generateToken, hashToken } from "./tokens";

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function requestMagicLink(email: string): Promise<void> {
  const token = generateToken();
  await db.insert(magicLinks).values({
    email,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS),
  });
  await sendMagicLinkEmail(email, `${env.appUrl}/auth/verify?token=${token}`);
}

/**
 * Consumes a magic-link token and returns the user it signs in, creating the
 * account on first use. Returns null if the token is unknown, used or expired.
 */
export async function consumeMagicLink(token: string) {
  const [link] = await db
    .update(magicLinks)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(magicLinks.tokenHash, hashToken(token)),
        isNull(magicLinks.consumedAt),
        gt(magicLinks.expiresAt, new Date()),
      ),
    )
    .returning({ email: magicLinks.email });
  if (!link) return null;

  const [user] = await db
    .insert(users)
    .values({ email: link.email })
    .onConflictDoUpdate({ target: users.email, set: { email: link.email } })
    .returning();
  return user;
}
