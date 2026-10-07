export interface StoredObject {
  stream: ReadableStream<Uint8Array>;
  size: number;
  /** Byte range actually returned (inclusive), or the whole object. */
  start: number;
  end: number;
}

export interface Storage {
  /** Writes the stream to `key` and returns the number of bytes stored. */
  put(key: string, data: ReadableStream<Uint8Array>): Promise<number>;
  /** Opens `key`, optionally restricted to an inclusive byte range. */
  get(key: string, range?: { start: number; end?: number }): Promise<StoredObject>;
  /** Deletes `key`. Missing objects are ignored. */
  delete(key: string): Promise<void>;
  /** Deletes everything under `prefix` (e.g. all of a user's recordings). */
  deletePrefix(prefix: string): Promise<void>;
}
