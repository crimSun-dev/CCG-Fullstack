import { spawnSync } from "node:child_process";

// A session left over from a failed deploy can hold Migrate's advisory lock and
// time out every later build with P1002. Only one deploy migrates at a time here,
// so the lock adds nothing.
const result = spawnSync("prisma", ["migrate", "deploy"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: "1" },
});

process.exit(result.status ?? 1);
