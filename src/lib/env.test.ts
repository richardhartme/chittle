import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "./env";

afterEach(() => vi.unstubAllEnvs());

describe("env", () => {
  describe("databaseUrl", () => {
    it("returns DATABASE_URL", () => {
      vi.stubEnv("DATABASE_URL", "postgres://x/y");
      expect(env.databaseUrl).toBe("postgres://x/y");
    });

    it("throws when it is missing or empty", () => {
      vi.stubEnv("DATABASE_URL", "");
      expect(() => env.databaseUrl).toThrow("Missing required environment variable DATABASE_URL");
    });
  });

  describe("appUrl", () => {
    it("defaults to localhost", () => {
      vi.stubEnv("APP_URL", "");
      expect(env.appUrl).toBe("http://localhost:3000");
    });

    it("strips a trailing slash", () => {
      vi.stubEnv("APP_URL", "https://chittle.example/");
      expect(env.appUrl).toBe("https://chittle.example");
    });
  });

  describe("storageDir", () => {
    it("defaults to ./storage resolved from the working directory", () => {
      vi.stubEnv("STORAGE_DIR", "");
      expect(env.storageDir).toBe(path.resolve("./storage"));
    });

    it("resolves a configured relative path", () => {
      vi.stubEnv("STORAGE_DIR", "data/recordings");
      expect(env.storageDir).toBe(path.resolve("data/recordings"));
    });

    it("keeps an absolute path", () => {
      vi.stubEnv("STORAGE_DIR", "/var/lib/chittle");
      expect(env.storageDir).toBe("/var/lib/chittle");
    });
  });

  it("treats empty API keys as unset", () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(env.resendApiKey).toBeUndefined();
    expect(env.anthropicApiKey).toBeUndefined();
  });

  it("returns API keys when set", () => {
    vi.stubEnv("RESEND_API_KEY", "re_123");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-123");
    expect(env.resendApiKey).toBe("re_123");
    expect(env.anthropicApiKey).toBe("sk-ant-123");
  });

  it("falls back to default email sender and topic model", () => {
    vi.stubEnv("EMAIL_FROM", "");
    vi.stubEnv("TOPIC_MODEL", "");
    expect(env.emailFrom).toBe("Chittle <login@example.com>");
    expect(env.topicModel).toBe("claude-haiku-4-5-20251001");
  });

  it("uses configured email sender and topic model", () => {
    vi.stubEnv("EMAIL_FROM", "Me <me@example.com>");
    vi.stubEnv("TOPIC_MODEL", "some-model");
    expect(env.emailFrom).toBe("Me <me@example.com>");
    expect(env.topicModel).toBe("some-model");
  });

  it("detects production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(env.isProduction).toBe(true);
    vi.stubEnv("NODE_ENV", "development");
    expect(env.isProduction).toBe(false);
  });
});
