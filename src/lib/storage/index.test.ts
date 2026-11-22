import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { LocalStorage } from "./local";

import { getStorage } from "./index";

const globalForStorage = globalThis as unknown as { storage?: unknown };

afterEach(() => {
  delete globalForStorage.storage;
  vi.unstubAllEnvs();
});

describe("getStorage", () => {
  it("returns a LocalStorage rooted at STORAGE_DIR", () => {
    vi.stubEnv("STORAGE_DIR", "/tmp/chittle-test-root");
    const storage = getStorage();
    expect(storage).toBeInstanceOf(LocalStorage);
    expect((storage as unknown as { root: string }).root).toBe(path.resolve("/tmp/chittle-test-root"));
  });

  it("reuses one instance", () => {
    expect(getStorage()).toBe(getStorage());
  });
});
