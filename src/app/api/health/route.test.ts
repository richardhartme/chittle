import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", async () => ({ db: (await import("@/test/db")).db }));

import { GET } from "./route";

describe("GET /api/health", () => {
  it("reports ok when the database is reachable", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
