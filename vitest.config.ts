import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    // Component tests opt in to jsdom with a `// @vitest-environment jsdom` docblock.
    environment: "node",
    setupFiles: ["src/test/setup.ts"],
    unstubEnvs: true,
    unstubGlobals: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test/**", "src/db/seed.ts"],
    },
  },
});
