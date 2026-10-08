import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, vi } from "vitest";
import { getStorage } from "@/lib/storage";

/** Points `getStorage()` at a fresh temp directory for each test, and removes it afterwards. */
export function withTempStorage() {
  const state = { root: "" };

  beforeEach(async () => {
    state.root = await mkdtemp(path.join(os.tmpdir(), "chittle-test-storage-"));
    vi.stubEnv("STORAGE_DIR", state.root);
    delete (globalThis as { storage?: unknown }).storage;
  });

  afterEach(async () => {
    delete (globalThis as { storage?: unknown }).storage;
    vi.unstubAllEnvs();
    await rm(state.root, { recursive: true, force: true });
  });

  return {
    get root() {
      return state.root;
    },
    storage: () => getStorage(),
  };
}

export const streamOf = (text: string) => new Response(text).body as ReadableStream<Uint8Array>;
