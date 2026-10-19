import { execSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";

// CK Virtual Lab (../lab) is served by this site at /lab (src/lib/lab-bridge.ts). The standalone
// server runs from .next/standalone and sees nothing outside it, so the lab's server, its runtime
// dependencies and its page go in beside it, the way bind-all-interfaces.mjs copies public/.
// Then, when LAB_DATABASE_URL is set, the lab's database gets the lab's migrations, as
// migrate.mjs does for this site's. Without ../lab the site builds without the lab.

const src = "../lab";
if (!existsSync(`${src}/server/src/app.js`)) {
  console.log("No ../lab: building without CK Virtual Lab");
  process.exit(0);
}

const out = ".next/standalone/lab";
rmSync(out, { recursive: true, force: true });
for (const part of ["server/package.json", "server/package-lock.json", "server/src", "server/migrations", "server/scripts"]) {
  cpSync(`${src}/${part}`, `${out}/${part}`, { recursive: true });
}
// The files GitHub Pages also published: no QA screenshots or briefs.
const site = "scrollcraft/builds/creative-episode";
for (const part of ["index.html", "scrollcraft.css", "scrollcraft.js", "ce-store.js", "assets", "fonts"]) {
  cpSync(`${src}/${site}/${part}`, `${out}/${site}/${part}`, { recursive: true });
}
// Production dependencies only (express, express-rate-limit, pg, ws), installed in the copy so the
// repo's lab/server/node_modules (with its test tools) is left alone.
execSync("npm ci --omit=dev --no-audit --no-fund", { cwd: `${out}/server`, stdio: "inherit" });
console.log(`CK Virtual Lab bundled into ${out}`);

const labDatabase = process.env.LAB_DATABASE_URL?.trim();
if (!labDatabase) {
  console.log("LAB_DATABASE_URL is not set: lab migrations skipped");
} else {
  // migrate.js reads DATABASE_URL; here that is the lab's database, never this site's.
  execSync("node scripts/migrate.js", {
    cwd: `${out}/server`,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: labDatabase, DIRECT_URL: "" },
  });
}
