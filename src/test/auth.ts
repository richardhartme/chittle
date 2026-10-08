import { createUser } from "@/test/db";
import { createSession } from "@/lib/auth/session";

/** Creates a user and signs them in, so `getCurrentUser()` returns them for the current test. */
export async function signIn(email?: string) {
  const user = await createUser(email);
  await createSession(user.id);
  return user;
}
