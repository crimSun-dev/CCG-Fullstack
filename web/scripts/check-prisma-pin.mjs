// CI guard (TDD 5.1): the npm `latest` tag is a Prisma 8 RC whose CLI has no `migrate`.
import { readFileSync } from "node:fs";

const read = (p) => JSON.parse(readFileSync(new URL(`../node_modules/${p}/package.json`, import.meta.url))).version;
const cli = read("prisma");
const client = read("@prisma/client");
const ok = (v) => /^7\.10\./.test(v);
if (!ok(cli) || !ok(client)) {
  console.error(`Prisma must be 7.10.x for both packages. Found prisma ${cli}, @prisma/client ${client}.`);
  process.exit(1);
}
console.log(`Prisma pin ok: ${cli}`);
