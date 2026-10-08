import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("resend", () => ({
  Resend: vi.fn(function (this: { emails: { send: typeof send } }) {
    this.emails = { send };
  }),
}));

import { Resend } from "resend";
import { sendMagicLinkEmail } from "./email";

beforeEach(() => {
  send.mockReset();
  vi.mocked(Resend).mockClear();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("sendMagicLinkEmail", () => {
  describe("without a Resend API key", () => {
    beforeEach(() => vi.stubEnv("RESEND_API_KEY", ""));

    it("logs the link to the console in development", async () => {
      vi.stubEnv("NODE_ENV", "development");
      await sendMagicLinkEmail("a@example.com", "http://localhost:3000/auth/verify?token=t");

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining("http://localhost:3000/auth/verify?token=t"));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining("a@example.com"));
      expect(send).not.toHaveBeenCalled();
    });

    it("refuses to run in production", async () => {
      vi.stubEnv("NODE_ENV", "production");
      await expect(sendMagicLinkEmail("a@example.com", "link")).rejects.toThrow("RESEND_API_KEY must be set");
      expect(console.log).not.toHaveBeenCalled();
    });
  });

  describe("with a Resend API key", () => {
    beforeEach(() => {
      vi.stubEnv("RESEND_API_KEY", "re_test");
      vi.stubEnv("EMAIL_FROM", "Chittle <hi@chittle.test>");
    });

    it("sends an email containing the link", async () => {
      send.mockResolvedValue({ data: { id: "1" }, error: null });
      await sendMagicLinkEmail("a@example.com", "https://chittle.test/auth/verify?token=t");

      expect(Resend).toHaveBeenCalledWith("re_test");
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          from: "Chittle <hi@chittle.test>",
          to: "a@example.com",
          text: expect.stringContaining("https://chittle.test/auth/verify?token=t"),
        }),
      );
    });

    it("throws when Resend reports an error", async () => {
      send.mockResolvedValue({ data: null, error: { message: "rate limited" } });
      await expect(sendMagicLinkEmail("a@example.com", "link")).rejects.toThrow(
        "Failed to send magic link: rate limited",
      );
    });
  });
});
