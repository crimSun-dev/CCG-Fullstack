## Context

See `proposal.md` for motivation. Authority for this change comes from `CRIMSUN_POOL/UNIFIED_DECISION_MANIFEST_CCG_WEBSITE.md` and `CRIMSUN_POOL/TDD_CCG_WEBSITE.md` (ranked P0 in the 2026-10-17 ProjectCompass report).

### Why This Change, and Not Public Accounts

1. **Staff accounts only (`AdminUser`):** The live contract has staff accounts only, provisioned with `pnpm admin:create`. Visitors leave a lead row (`Lead`). Public registration, usernames, and Google login would require a manifest revision, not this change (`UNIFIED_DECISION_MANIFEST_CCG_WEBSITE.md` `VETO-A1` and session decision; ProjectCompass critical gap; `RULE-draft-4` [TIER-0]).
2. **Observed 2026-10-17 build failure:** `pnpm build` on the NTFS copy (`C:\Users\Draven Chen\src\ccg-public-web`) already compiled and typechecked on 2026-10-17, then failed while prerendering `/coach` because `person.findMany()` used the example `postgres:postgres` credentials from `.env.example` and the local Postgres server on `localhost:5432` rejected them. Separately, exit code `2` observed from the throwaway Postgres process was post-suite cleanup after tests had already run and must not be treated as a failed test suite.
3. **Reconciling README and Backlog:** `web/README.md` states the functional skeleton exists, while `CRIMSUN_POOL/BACKLOG_CCG_WEBSITE.md` still has every checkbox unchecked. This change produces a concrete verification status record (`CRIMSUN_POOL/BUILD_STATUS_CCG_WEBSITE.md`) so the two stop disagreeing, without checking off boxes in `BACKLOG_CCG_WEBSITE.md` from memory.

### Observed Codebase State

- **Application (`CCG Fullstack Web/web` and NTFS copy `C:\Users\Draven Chen\src\ccg-public-web`):** Package name `ccg-public-web`. Relevant scripts: `pnpm build`, `pnpm test:unit`, `pnpm test`, `pnpm test:e2e`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm check:prisma-pin`.
- **Version Pins:** Next `16.4.2`, React `19.2.9`, `prisma` and `@prisma/client` `7.10.1`. `pnpm check:prisma-pin` fails if Prisma drifts; never run `pnpm add prisma` without `@7.10`.
- **Environment Placeholders (`web/.env.example`):** `DATABASE_URL` (`ccg_public`) and `TEST_DATABASE_URL` (`ccg_public_test`) on `localhost:5432` with placeholder `postgres:postgres`. Database and e2e tests refuse to run if `TEST_DATABASE_URL` equals `DATABASE_URL`.
- **Startup Guards (`src/instrumentation-node.ts` via `src/lib/env.ts`):** Process exits immediately if `DATABASE_URL`, `LEAD_TO_EMAIL`, or `LEAD_IP_SALT` (>= 16 chars) is missing, or if `HUB_DATABASE_HOST` is set and matches the hostname of `DATABASE_URL`.
- **Build-Time Database Reads:** Public Server Component pages (including `/coach` via `content.listPeople()`) query Postgres at build time through `ContentRepository`. Invalid credentials in `DATABASE_URL` cause `pnpm build` to fail during static generation.
- **Prisma Schema (`web/prisma/schema.prisma`):** Models are `Program`, `Person`, `Office`, `Stat`, `Pressure`, `Lead`, `LeadAttempt`, `AdminUser`, and `AdminSession`. There is no public `User` model, no Google subject column, and no username column.

## Goals / Non-Goals

**Goals:**
- Verify that the NTFS copy (`C:\Users\Draven Chen\src\ccg-public-web`) matches `CCG Fullstack Web/web` for `package.json` and `prisma/schema.prisma` (syncing source forward if needed).
- Configure `.env` on the NTFS copy against the existing local Postgres instance on `localhost:5432` with two distinct databases (`ccg_public` and `ccg_public_test`), migrate and seed `ccg_public`, and achieve exit code `0` on `pnpm build`, `pnpm test:unit`, and `pnpm test` (plus `pnpm test:e2e` if Playwright browsers are installed).
- Record secret-free execution evidence in `CRIMSUN_POOL/BUILD_STATUS_CCG_WEBSITE.md`.

**Non-Goals:**
- Public registration, Google OpenID Connect, usernames, password-change UI, or a second user table.
- Resolving `CLARIFY-001` (Erry Sunarli's title) or `CLARIFY-002` (deck photos); the seed's `null` role remains untouched.
- Visual design, CSS, or replacing `public/brand/ccg-mark.svg`.
- Neon production provisioning, Vercel deployment, or editing `UNIFIED_DECISION_MANIFEST_CCG_WEBSITE.md` / `TDD_CCG_WEBSITE.md`.
- Running `pnpm dev` or `pnpm build` on the `G:` (exFAT) drive.

## Decisions

| Fork | Decision | Rejected Alternative | Authority |
|---|---|---|---|
| **Where Next runs** | Run Next (`pnpm build`, `pnpm dev`, `pnpm test:e2e`) only on the NTFS copy `C:\Users\Draven Chen\src\ccg-public-web` | Running `pnpm dev` or `pnpm build` on `G:` | Observed exFAT junction failure (`os error 1`) in `.next/`. `web/README.md` local-setup section |
| **Database** | Use the single local Postgres server already running on `localhost:5432` with two distinct databases: `ccg_public` (`DATABASE_URL`) and `ccg_public_test` (`TEST_DATABASE_URL`) | Starting a second Postgres engine, using equal URLs, or pointing either URL at the office hub | `TDD_CCG_WEBSITE.md`: isolated from the office hub. `web/.env.example` names both databases |
| **Credentials** | Read the real local superuser credentials for the existing server and write them only into `.env` on the NTFS copy (`.env` remains gitignored) | Committing a password, or keeping `postgres:postgres` when the server rejects it | `TRAP-016` and `RULE-034` (`FULLSTACK_JS_STRATEGIES_2025`). The 2026-10-17 build proved `postgres:postgres` is rejected |
| **If the real password cannot be found** | Stop immediately and ask the user. Do not reset the cluster, do not install a second Postgres, and do not place guessed passwords in prompts or status notes | Hunting the disk for arbitrary credential files and printing them, or resetting the local cluster | Secrets stay out of the repository and out of the chat log |
| **What "proved" means** | `pnpm build` exits `0` on the NTFS copy after `pnpm db:migrate` and `pnpm db:seed`; `pnpm test:unit` exits `0`; `pnpm test` exits `0` against `TEST_DATABASE_URL` | Treating the README's "skeleton exists" line as proof | ProjectCompass: unchecked backlog vs README. Evidence is the command output |
| **End-to-end (`e2e`)** | Run `pnpm test:e2e` only after `pnpm build` is green and Playwright browsers are installed; if browsers are missing, record `"not run"` and the reason in the status note and stop | Deleting tests to skip e2e, or marking e2e passed without a run | `TDD_CCG_WEBSITE.md` Phase 2–4 exit gates |
| **Status note** | Write one new file, `CRIMSUN_POOL/BUILD_STATUS_CCG_WEBSITE.md`, listing each command, the date, the exit code, and the tree it ran on — with zero passwords or connection strings | Editing every `[ ]` in `BACKLOG_CCG_WEBSITE.md` into `[x]` from memory | ProjectCompass step 2: the backlog stays the plan; the status note is the evidence |
| **Source of truth for code** | Do not modify application code unless a test or build fails for a non-credential reason; fix credential-only failures in `.env`, not in pages | Refactoring, adding an auth system, or adding CSS | This change is a proof, not a feature. `RULE-007` (`TINY_SWORDS_LAST_STAND_HISTORY`) `[TIER-0]`: smallest diff that reuses the existing flow |
| **Accounts** | No new tables, no Google login, no username column, no self-registration | Folding a "user database" into this change | Manifest session decision. `MISTAKE-001` (`EXCEL_WORKFLOW_HISTORY`) (`IMPACT-HIGH`): do not freeze columns before the real user is named. `RULE-030` (`SYSTEM_DESIGN_FULLSTACK_PRODUCTION`) applies only after Google sign-in is in scope |
| **Photos and visual design** | No deck images, no new CSS | Addressing `CLARIFY-002` or a visual redesign while the build is red | ProjectCompass step 4 |

### Resolved Conflict (Restated, Not Relitigated)

- **`RULE-008` (`FULLSTACK_WEB_REACT_NODE_MONGO`) vs `RULE-034` (`SYSTEM_DESIGN_FULLSTACK_PRODUCTION`):** `RULE-008` states an Express app always adds `cors()`. This application is a single Next.js origin. `RULE-034` wins: no CORS middleware is added, and no separate API origin is introduced while proving the build.

### Pool Gaps

- **Host & Local Service Names:** Neon, Vercel cache tags, and the local Windows Postgres service name are not in the pool. This change uses whatever Postgres server is already listening on `localhost:5432` and does not pick a new host.
- **Public Member Definition:** No pool entry defines a public member for CK Coaching Group. That absence is why public user accounts are out of scope, not a hole to fill with a speculative schema.

## Risks / Trade-offs

- **[Risk] Real local Postgres password is unknown or inaccessible** → **Mitigation:** Stop immediately and ask the user for the local Postgres credentials or to set `.env` on `C:\Users\Draven Chen\src\ccg-public-web\.env`; never reset the Postgres cluster or log secrets.
- **[Risk] Source drift between `G:\...\CCG Fullstack Web\web` and `C:\Users\Draven Chen\src\ccg-public-web`** → **Mitigation:** Compare `package.json` and `prisma/schema.prisma` (and source files) before running commands and sync source forward without overwriting `.env`.
- **[Risk] Playwright browsers are not installed locally** → **Mitigation:** Check browser availability after `pnpm build` succeeds; if missing, record `"not run"` and the exact reason in `CRIMSUN_POOL/BUILD_STATUS_CCG_WEBSITE.md` rather than deleting tests or claiming a pass.
