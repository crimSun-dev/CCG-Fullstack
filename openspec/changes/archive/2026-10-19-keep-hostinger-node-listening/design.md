# Design: Keep the Hostinger Node process listening

## Context

See `proposal.md` for motivation. Hostinger's build pipeline runs `pnpm install` in the web directory followed by the build command, then copies `.next/standalone` into the versioned deployment directory and executes `node server.js`. In build `01a153c2-3004-71de-9b95-5b474d2e556e`, `pnpm 11.24` generated an isolated virtual store (`node_modules/.pnpm`) despite `web/pnpm-workspace.yaml` containing `nodeLinker: hoisted`, because `pnpm-workspace.yaml` lacked the required `packages:` field and `.npmrc` is no longer parsed for `node-linker` in pnpm 11. Consequently, Next's standalone tracing symlinked dependencies to the build tree's virtual store, which broke upon file relocation.

## Goals / Non-Goals

**Goals:**
- Enforce a hoisted, flat dependency layout before Next.js builds standalone output.
- Fail the build immediately if `node_modules/next` or `.next/standalone/node_modules/next` is a symlink.
- Remove obsolete `.npmrc` keys and add explicit `packages: ['.']` to `web/pnpm-workspace.yaml`.
- Prove that the resulting standalone server can be moved to an independent path and start listening with required runtime env vars set.

**Non-Goals:**
- Modifying database connection routing (`neondb` vs `ccg_public`).
- Addressing SWC WASM fallback warnings or GitHub Pages export behavior.
- Baking runtime secrets or `.env` files into `.next/standalone`.

## Decisions

### Decision: Command-line linker override inside the build script
Using `pnpm install --config.node-linker=hoisted --frozen-lockfile` inside `web/package.json`'s build script:
- pnpm 11 reads `nodeLinker` only from `pnpm-workspace.yaml` (when recognized as a workspace) and ignores `node-linker` in `.npmrc`.
- Passing `--config.node-linker=hoisted` via CLI takes precedence over any cached or omitted file settings.
- Adding a pre-build check via `web/scripts/assert-hoisted.mjs` prevents tracing an isolated install into standalone artifacts.
- Alternatives considered:
  - *Leaving `pnpm-workspace.yaml` as the sole control*: Rejected. It was already in place in `4dd3ecc` and Hostinger's install still defaulted to isolated virtual store.
  - *Setting `packageImportMethod: copy`*: Rejected. This still links `node_modules/next` to `.pnpm`.
  - *Embedding `.env` into `.next/standalone`*: Rejected. Production credentials must come from Hostinger's process environment.

### Decision: Explicit workspace packages declaration
Adding `packages: ['.']` to `web/pnpm-workspace.yaml`:
- In pnpm 10 and 11, `packages` is a mandatory property for workspace-level settings like `nodeLinker` to be parsed. Without it, pnpm treats the directory as a non-workspace root.

## Risks / Trade-offs

- **[Risk]** Re-running `pnpm install` during the build adds a few seconds to build time.
  - **Mitigation:** `--frozen-lockfile` reuses downloaded store cache packages, completing in seconds.
- **[Risk]** Missing runtime environment variables on Hostinger causes immediate exit code 1.
  - **Mitigation:** Explicitly document and verify that Hostinger hPanel Node.js settings supply `DATABASE_URL`, `LEAD_TO_EMAIL`, and `LEAD_IP_SALT`.

## File Changes

- `web/package.json` (modified): Update `build` script to reinstall hoisted and run `assert-hoisted.mjs`.
- `web/scripts/assert-hoisted.mjs` (new): Exit non-zero if `node_modules/next` is a symlink.
- `web/pnpm-workspace.yaml` (modified): Add `packages: ['.']`, keep `nodeLinker: hoisted`.
- `web/.npmrc` (modified): Remove ignored `node-linker=hoisted`.
- `web/scripts/bind-all-interfaces.mjs` (modified): Assert standalone dependencies are self-contained.
