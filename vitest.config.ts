import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // The default 5000ms is tight for the heavier Mantine/userEvent
    // interaction tests (e.g. creativewriter-workspace.test.tsx) on a slower
    // CI runner -- they pass comfortably under it locally but timed out in
    // CI's first-ever run of the suite. A genuinely hung test still fails,
    // just later.
    testTimeout: 15000,
  },
});
