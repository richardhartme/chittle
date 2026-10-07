import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Storage, StoredObject } from "./types";

export class LocalStorage implements Storage {
  constructor(private readonly root: string) {}

  /** Resolves a key to a path, refusing anything that escapes the storage root. */
  private resolve(key: string): string {
    const full = path.resolve(this.root, key);
    if (full !== this.root && !full.startsWith(this.root + path.sep)) {
      throw new Error("Invalid storage key");
    }
    return full;
  }

  async put(key: string, data: ReadableStream<Uint8Array>): Promise<number> {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });

    let bytes = 0;
    const counter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        bytes += chunk.length;
        cb(null, chunk);
      },
    });

    try {
      await pipeline(Readable.fromWeb(data as never), counter, createWriteStream(file));
    } catch (err) {
      await rm(file, { force: true });
      throw err;
    }
    return bytes;
  }

  async get(key: string, range?: { start: number; end?: number }): Promise<StoredObject> {
    const file = this.resolve(key);
    const { size } = await stat(file);
    const start = range?.start ?? 0;
    const end = Math.min(range?.end ?? size - 1, size - 1);
    if (size === 0 || start > end) throw new RangeError("Unsatisfiable range");

    const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream<Uint8Array>;
    return { stream, size, start, end };
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  async deletePrefix(prefix: string): Promise<void> {
    await rm(this.resolve(prefix), { recursive: true, force: true });
  }
}
