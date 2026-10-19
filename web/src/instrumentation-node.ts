import { env } from "./lib/env";

// A missing DATABASE_URL, LEAD_TO_EMAIL, or salt stops the process here (TDD Phase 4, item 4).
// Next.js would otherwise log the error and keep serving 500s.
try {
  env();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
