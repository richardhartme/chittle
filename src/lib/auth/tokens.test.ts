import { describe, expect, it } from "vitest";
import { generateToken, hashToken } from "./tokens";

describe("generateToken", () => {
  it("returns a URL-safe token with 256 bits of entropy", () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("returns a different token each time", () => {
    const tokens = new Set(Array.from({ length: 50 }, generateToken));
    expect(tokens.size).toBe(50);
  });
});

describe("hashToken", () => {
  it("is a deterministic sha256 hex digest", () => {
    expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hashToken("abc")).toBe(hashToken("abc"));
  });

  it("differs for different tokens and never returns the token itself", () => {
    const token = generateToken();
    expect(hashToken(token)).not.toBe(token);
    expect(hashToken(token)).not.toBe(hashToken(generateToken()));
  });
});
