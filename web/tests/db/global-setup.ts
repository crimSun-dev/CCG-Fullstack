import { execSync } from "node:child_process";
import { testDatabaseUrl } from "./test-database";

// Apply pending migrations and reseed before any DB test runs. `migrate deploy` never drops
// data; for a from-scratch check of the Phase 1 deliverable, run `pnpm db:reset` yourself.
export default function setup() {
  const url = testDatabaseUrl();
  const env = { ...process.env, DATABASE_URL: url };
  execSync("npx prisma migrate deploy", { stdio: "inherit", env });
  execSync("npx prisma db seed", { stdio: "inherit", env });
}
