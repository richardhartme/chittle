import { randomBytes } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { canEncrypt, decrypt, encrypt } from "./crypto";

beforeEach(() => {
  vi.stubEnv("ENCRYPTION_KEY", randomBytes(32).toString("base64"));
});

describe("encrypt and decrypt", () => {
  it("round-trips a value", () => {
    expect(decrypt(encrypt("sk-ant-secret-1234"))).toBe("sk-ant-secret-1234");
  });

  it("gives a different ciphertext each time for the same input", () => {
    const a = encrypt("same");
    const b = encrypt("same");
    expect(a).not.toBe(b);
    expect(a).not.toContain("same");
  });

  it("refuses to decrypt a tampered ciphertext", () => {
    const [iv, tag, ciphertext] = encrypt("sk-ant-secret-1234").split(".");
    const bytes = Buffer.from(ciphertext, "base64");
    bytes[0] ^= 1;
    expect(() => decrypt([iv, tag, bytes.toString("base64")].join("."))).toThrow();
  });

  it("refuses a truncated auth tag", () => {
    const [iv, tag, ciphertext] = encrypt("sk-ant-secret-1234").split(".");
    const short = Buffer.from(tag, "base64").subarray(0, 4).toString("base64");
    expect(() => decrypt([iv, short, ciphertext].join("."))).toThrow();
  });

  it("refuses to decrypt under a different key", () => {
    const payload = encrypt("sk-ant-secret-1234");
    vi.stubEnv("ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    expect(() => decrypt(payload)).toThrow();
  });

  it("fails clearly when ENCRYPTION_KEY is missing", () => {
    vi.stubEnv("ENCRYPTION_KEY", "");
    expect(() => encrypt("x")).toThrow("ENCRYPTION_KEY is not set");
  });

  it("fails clearly when ENCRYPTION_KEY is the wrong length", () => {
    vi.stubEnv("ENCRYPTION_KEY", randomBytes(16).toString("base64"));
    expect(() => encrypt("x")).toThrow("ENCRYPTION_KEY must be 32 bytes");
  });
});

describe("canEncrypt", () => {
  it("is true only for a 32-byte base64 key", () => {
    expect(canEncrypt()).toBe(true);
    vi.stubEnv("ENCRYPTION_KEY", "");
    expect(canEncrypt()).toBe(false);
    vi.stubEnv("ENCRYPTION_KEY", randomBytes(16).toString("base64"));
    expect(canEncrypt()).toBe(false);
  });
});
