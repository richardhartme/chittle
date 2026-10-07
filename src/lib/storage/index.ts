import { env } from "@/lib/env";
import { LocalStorage } from "./local";
import type { Storage } from "./types";

export type { Storage } from "./types";

const globalForStorage = globalThis as unknown as { storage?: Storage };

/** The configured storage backend. Swap the implementation here to move to S3/R2. */
export function getStorage(): Storage {
  return (globalForStorage.storage ??= new LocalStorage(env.storageDir));
}
