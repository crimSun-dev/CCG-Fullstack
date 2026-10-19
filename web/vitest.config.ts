import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" },
      },
      {
        resolve: { alias },
        test: {
          name: "db",
          include: ["tests/db/**/*.test.ts"],
          environment: "node",
          // One database, so files run one at a time.
          fileParallelism: false,
          globalSetup: ["tests/db/global-setup.ts"],
          setupFiles: ["tests/db/setup-env.ts"],
          testTimeout: 20_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
