import { cpSync, readFileSync, writeFileSync } from "node:fs";

// Hostinger sets HOSTNAME to the machine name. Next's standalone server treats that
// as the listen address and exits, which the proxy reports as 503.
const file = ".next/standalone/server.js";
const source = readFileSync(file, "utf8");
const next = source.replace(
  "const hostname = process.env.HOSTNAME || '0.0.0.0'",
  "const hostname = '0.0.0.0'",
);

if (next === source) {
  console.error(`Could not find the HOSTNAME bind in ${file}`);
  process.exit(1);
}

writeFileSync(file, next);
console.log("Standalone server listens on 0.0.0.0");

// Standalone does not include these on its own. Without them the server
// boots and then has nothing to serve.
const standalone = ".next/standalone";
cpSync("public", `${standalone}/public`, { recursive: true });
cpSync(".next/static", `${standalone}/.next/static`, { recursive: true });
