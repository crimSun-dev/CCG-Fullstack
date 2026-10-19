## Why

The CK Coaching Group public site (`ccg-public-web`) already has its routes, Prisma 7.10 schema, lead capture flow, and staff admin, and it compiled and typechecked on the NTFS copy (`C:\Users\Draven Chen\src\ccg-public-web`) on 2026-10-17 before failing while prerendering `/coach` because `.env.example` placeholder credentials (`postgres:postgres`) were rejected by the local Postgres server on `localhost:5432`. Proving that `pnpm build`, `pnpm test:unit`, and `pnpm test` pass against real local Postgres databases (`ccg_public` and `ccg_public_test`) and recording secret-free command evidence resolves the mismatch between `web/README.md` ("skeleton exists") and the unchecked `CRIMSUN_POOL/BACKLOG_CCG_WEBSITE.md` without expanding scope into unapproved user accounts or visual design.

## What Changes

- Configure `.env` on the NTFS working copy (`C:\Users\Draven Chen\src\ccg-public-web`) to point `DATABASE_URL` (`ccg_public`) and `TEST_DATABASE_URL` (`ccg_public_test`) at the existing local Postgres instance using its real local superuser credentials (stopping immediately to ask if the real password cannot be found).
- Run `pnpm db:migrate` and `pnpm db:seed` against `DATABASE_URL`, then verify `pnpm build` exits `0` on the NTFS copy (`C:\Users\Draven Chen\src\ccg-public-web`) with public pages prerendering against seeded data.
- Run `pnpm test:unit` and `pnpm test` against `TEST_DATABASE_URL` (and `pnpm build && pnpm test:e2e` if Playwright browsers are installed; otherwise record `"not run"` and the reason).
- Write `CRIMSUN_POOL/BUILD_STATUS_CCG_WEBSITE.md` listing each command executed, the date, the exit code, and which directory tree it ran on, with no passwords or connection strings.
- Keep public registration, Google OpenID Connect, usernames, extra user tables, deck photos (`CLARIFY-002`), Erry's title (`CLARIFY-001`), and visual design/CSS strictly out of scope; the visitor write path remains the lead row and staff accounts remain provisioned via `pnpm admin:create`.

## Capabilities

### New Capabilities
- `local-build-proof`: Proves the public site builds and passes verification suites against separated local Postgres databases (`DATABASE_URL` and `TEST_DATABASE_URL`), enforces hub database isolation and the three-program public catalog gate, and records secret-free command execution evidence.

### Modified Capabilities

## Impact

- **Environment & Database (`C:\Users\Draven Chen\src\ccg-public-web\.env`)**: Local gitignored `.env` configured with two separate local Postgres databases (`ccg_public` and `ccg_public_test`).
- **Build & Test Verification**: Exercises `pnpm db:migrate`, `pnpm db:seed`, `pnpm build`, `pnpm test:unit`, `pnpm test`, and conditionally `pnpm test:e2e` on the NTFS copy (`C:\Users\Draven Chen\src\ccg-public-web`) where Next.js 16 `.next` junctions succeed.
- **Evidence Documentation (`CRIMSUN_POOL/BUILD_STATUS_CCG_WEBSITE.md`)**: New status document reconciling `web/README.md` and `CRIMSUN_POOL/BACKLOG_CCG_WEBSITE.md` without checking off backlog items from memory or leaking credentials.
- **Application Code (`CCG Fullstack Web/web`)**: Unchanged unless a test or build fails for a non-credential reason (source synced forward to the NTFS copy if `package.json` or `prisma/schema.prisma` drifted).
