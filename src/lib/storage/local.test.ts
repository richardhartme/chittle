import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalStorage } from "./local";

let root: string;
let storage: LocalStorage;

const streamOf = (text: string) =>
  new Response(text).body as ReadableStream<Uint8Array>;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "chittle-storage-"));
  storage = new LocalStorage(root);
});

afterEach(() => rm(root, { recursive: true, force: true }));

describe("LocalStorage", () => {
  it("round-trips an object and reports its size", async () => {
    expect(await storage.put("u1/a.webm", streamOf("hello world"))).toBe(11);
    const obj = await storage.get("u1/a.webm");
    expect(obj.size).toBe(11);
    expect(await new Response(obj.stream).text()).toBe("hello world");
  });

  it("serves byte ranges", async () => {
    await storage.put("u1/a.webm", streamOf("0123456789"));
    const obj = await storage.get("u1/a.webm", { start: 2, end: 5 });
    expect([obj.start, obj.end]).toEqual([2, 5]);
    expect(await new Response(obj.stream).text()).toBe("2345");
  });

  it("deletes objects and prefixes, ignoring missing ones", async () => {
    await storage.put("u1/a.webm", streamOf("a"));
    await storage.put("u1/b.webm", streamOf("b"));
    await storage.delete("u1/a.webm");
    await storage.delete("u1/missing.webm");
    await expect(stat(path.join(root, "u1/a.webm"))).rejects.toThrow();
    await storage.deletePrefix("u1");
    await expect(stat(path.join(root, "u1"))).rejects.toThrow();
  });

  it("refuses keys that escape the storage root", async () => {
    await expect(storage.put("../evil", streamOf("x"))).rejects.toThrow("Invalid storage key");
    await expect(storage.get("../../etc/passwd")).rejects.toThrow("Invalid storage key");
  });
});
