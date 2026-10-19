# Proposal: Keep the Hostinger Node process listening

## Why

The published Next.js server on Hostinger exits immediately after restart, causing the reverse proxy to return 503 Service Unavailable. The hostname rewrite already ran successfully in build `01a153c2-3004-71de-9b95-5b474d2e556e`, but dependencies were installed into pnpm's isolated virtual store (`node_modules/.pnpm`). Because Next.js standalone tracing followed those symlinks into `.next/standalone`, the copied standalone server cannot resolve its dependencies when deployed by Hostinger and crashes on boot. Additionally, the standalone server requires `DATABASE_URL`, `LEAD_TO_EMAIL`, and `LEAD_IP_SALT` to be present in the runtime environment or instrumentation will exit immediately.

## What Changes

- Update `web/package.json` build script to enforce a hoisted frozen install (`pnpm install --config.node-linker=hoisted --frozen-lockfile`) prior to `next build`.
- Add `web/scripts/assert-hoisted.mjs` to fail the build if `node_modules/next` remains a symlink.
- Update `web/pnpm-workspace.yaml` to declare `packages: ['.']` and retain `nodeLinker: hoisted`.
- Remove the deprecated/ignored `node-linker=hoisted` entry from `web/.npmrc`.
- Verify the published standalone output resolves dependencies self-containedly and handles missing required runtime environment variables by failing before listening.

## Capabilities

### New Capabilities
- `hostinger-runtime`: Runtime module resolution, dependency layout assertion, and startup environment validation for the Hostinger standalone deployment.

### Modified Capabilities
<!-- None -->

## Impact

- `web/package.json`: Re-runs install with hoisted linker before `next build`.
- `web/scripts/assert-hoisted.mjs`: New verification step in build pipeline.
- `web/pnpm-workspace.yaml`: Adds explicit workspace packages entry for pnpm 11 workspace recognition.
- `web/.npmrc`: Cleans up ignored key.
- Hostinger deployment pipeline: Guarantees standalone artifact contains real file trees rather than virtual-store symlinks.
