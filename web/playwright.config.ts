import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

// Runs against `next start` on the test database. Build first: `pnpm build && pnpm test:e2e`.
const PORT = 3200;
const testDb = process.env.TEST_DATABASE_URL ?? "";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // TDD 5.3: a 390px-wide project for / and /contact.
    { name: "narrow", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" }, grep: /@narrow/ },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/privacy`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { DATABASE_URL: testDb, CCG_APP_DATABASE_URL: process.env.DATABASE_URL ?? "" },
  },
});
