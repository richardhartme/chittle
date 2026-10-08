import { afterEach } from "vitest";

// Only set up the DOM helpers when a test runs under jsdom.
if (typeof document !== "undefined") {
  const { cleanup } = await import("@testing-library/react");
  await import("@testing-library/jest-dom/vitest");
  afterEach(cleanup);
}
