import { env } from "./lib/env";
import { installLabUpgrade } from "./lib/lab-bridge";

// A missing DATABASE_URL, LEAD_TO_EMAIL, or salt stops the process here (TDD Phase 4, item 4).
// Next.js would otherwise log the error and keep serving 500s.
let config;
try {
  config = env();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

// CK Virtual Lab at /lab: its live socket is taken before Next sees the upgrade (src/lib/lab-bridge.ts).
if (config.LAB_DATABASE_URL) installLabUpgrade();
