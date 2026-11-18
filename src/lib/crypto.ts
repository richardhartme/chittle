import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function key(): Buffer {
  const raw = env.encryptionKey;
  if (!raw) throw new Error("ENCRYPTION_KEY is not set");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return buf;
}

/** Whether `ENCRYPTION_KEY` is set to a usable 32-byte key. */
export function canEncrypt(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

/** Encrypts with AES-256-GCM under a fresh IV. Returns `iv.tag.ciphertext`, each part base64. */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv, { authTagLength: TAG_BYTES });
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((b) => b.toString("base64")).join(".");
}

/** Reverses `encrypt`. Throws if the value was tampered with or encrypted under another key. */
export function decrypt(payload: string): string {
  const [iv, tag, ciphertext] = payload.split(".").map((part) => Buffer.from(part, "base64"));
  // Pinning the tag length stops a truncated tag from being accepted, which would weaken the authentication.
  const decipher = createDecipheriv(ALGORITHM, key(), iv, { authTagLength: TAG_BYTES });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
