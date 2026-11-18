import { vi } from "vitest";

/**
 * In-memory stand-ins for `next/headers` and `next/navigation`. Use from `vi.mock` factories:
 *
 *   vi.mock("next/headers", async () => (await import("@/test/next")).headersMock);
 *   vi.mock("next/navigation", async () => (await import("@/test/next")).navigationMock);
 *   vi.mock("next/cache", async () => (await import("@/test/next")).cacheMock);
 */
export const cookieJar = new Map<string, { value: string; options?: Record<string, unknown> }>();

export const cookieStore = {
  get: (name: string) => {
    const entry = cookieJar.get(name);
    return entry ? { name, value: entry.value } : undefined;
  },
  set: vi.fn((name: string, value: string, options?: Record<string, unknown>) => {
    cookieJar.set(name, { value, options });
  }),
  delete: vi.fn((name: string) => {
    cookieJar.delete(name);
  }),
};

export const headersMock = { cookies: async () => cookieStore };

/** Like the real `redirect`, throws so that code after it doesn't run. */
export class RedirectError extends Error {
  constructor(public readonly location: string) {
    super(`NEXT_REDIRECT ${location}`);
  }
}

export const redirect = vi.fn((location: string): never => {
  throw new RedirectError(location);
});

export const navigationMock = { redirect, useRouter: () => ({ push: vi.fn() }) };

/** `refresh()` only works inside a real Server Action request, so it's a no-op spy here. */
export const refresh = vi.fn();

export const cacheMock = { refresh };

/** Runs `fn` and returns the location it redirected to, or null if it didn't redirect. */
export async function redirectedTo(fn: () => unknown): Promise<string | null> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof RedirectError) return err.location;
    throw err;
  }
  return null;
}

export function resetNextMocks(): void {
  cookieJar.clear();
  cookieStore.set.mockClear();
  cookieStore.delete.mockClear();
  redirect.mockClear();
  refresh.mockClear();
  after.mockClear();
}

/**
 * Stand-in for `next/server`'s `after()`: callbacks run straight away, and `afterSettled()` waits for them.
 *
 *   vi.mock("next/server", async () => (await import("@/test/next")).serverMock);
 */
const afterTasks: Promise<unknown>[] = [];

export const after = vi.fn((task: () => unknown) => {
  afterTasks.push(Promise.resolve().then(task));
});

export const serverMock = { after };

export async function afterSettled(): Promise<void> {
  await Promise.all(afterTasks.splice(0));
}
