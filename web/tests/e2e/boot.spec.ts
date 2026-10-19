import { spawn } from "node:child_process";
import { expect, test } from "@playwright/test";

// Empty strings shadow the values in .env (Next.js does not override variables that are already set).
test("test_missing_lead_to_email_refuses_boot", async () => {
  test.setTimeout(60_000);
  const child = spawn("npx", ["next", "start", "-p", "3299"], {
    env: { ...process.env, LEAD_TO_EMAIL: "", DATABASE_URL: "" },
    shell: true,
  });
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));

  const code = await new Promise<number | null>((resolve) => {
    const timer = setTimeout(() => {
      child.kill();
      resolve(null);
    }, 45_000);
    child.on("exit", (c) => {
      clearTimeout(timer);
      resolve(c);
    });
  });

  expect(code, output).not.toBe(0);
  expect(code, "server kept running instead of exiting").not.toBeNull();
  expect(output).toContain("LEAD_TO_EMAIL");
  expect(output).toContain("DATABASE_URL");
});
