import { lstatSync } from "node:fs";

// An isolated pnpm install makes node_modules/next a link into node_modules/.pnpm.
// Standalone tracing copies that link, and the published server cannot find next.
if (lstatSync("node_modules/next").isSymbolicLink()) {
  console.error("node_modules/next is a symlink. Install with --config.node-linker=hoisted before next build.");
  process.exit(1);
}
console.log("node_modules/next is a real directory");
