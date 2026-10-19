# Tasks

## 1. Install layout

- [x] 1.1 Add `packages: ['.']` to `web/pnpm-workspace.yaml` and retain `nodeLinker: hoisted`.
- [x] 1.2 Remove the ignored `node-linker=hoisted` line from `web/.npmrc`.
- [x] 1.3 Create `web/scripts/assert-hoisted.mjs` to exit non-zero if `node_modules/next` is a symlink.
- [x] 1.4 Update `web/package.json` build script to run `pnpm install --config.node-linker=hoisted --frozen-lockfile` and `node scripts/assert-hoisted.mjs` before `next build`.

## 2. Publish proof

- [x] 2.1 Build standalone and verify `.next/standalone` resolves dependencies without pointing to `node_modules/.pnpm`.
- [x] 2.2 Start that standalone server from a separate relocated directory with `DATABASE_URL`, `LEAD_TO_EMAIL`, and `LEAD_IP_SALT` set, and verify it listens and serves `/`.
- [x] 2.3 Start the standalone server once without `DATABASE_URL` and verify it prints the validation error and exits immediately.
