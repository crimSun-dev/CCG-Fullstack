## 1. Tree Sync and Local Postgres Environment Setup

- [x] 1.1 Confirm the NTFS tree (`C:\Users\Draven Chen\src\ccg-public-web`) matches `CCG Fullstack Web/web` for `package.json` and `prisma/schema.prisma` (and copy source forward if it does not, without copying `.env` from `G:` if `G:` has none); verify file parity and that `pnpm check:prisma-pin` exits `0` on the NTFS copy.
- [x] 1.2 On the NTFS copy (`C:\Users\Draven Chen\src\ccg-public-web`), set `.env` from `.env.example` using the real local Postgres user on `localhost:5432` (stopping immediately to ask if the real password cannot be found, never printing the password or connection string) and create the `ccg_public` and `ccg_public_test` databases if missing; verify both databases exist and `DATABASE_URL` differs from `TEST_DATABASE_URL`.

## 2. Database Migration, Seed, and Production Build Gate

- [x] 2.1 Run `pnpm db:migrate` and `pnpm db:seed` against `DATABASE_URL` (`ccg_public`) on `C:\Users\Draven Chen\src\ccg-public-web`; verify both commands exit `0` and seed the three approved programs (`leadership-advisory`, `group-coaching`, `premium-coaching`), people, and offices.
- [x] 2.2 Run `pnpm build` on `C:\Users\Draven Chen\src\ccg-public-web` and verify it exits `0` (if it fails on authentication, fix `.env` and rerun; if it fails for any non-credential reason, stop and report the error without widening scope).

## 3. Automated Test Suites (`test:unit`, `test`, and Conditional `test:e2e`)

- [x] 3.1 Run `pnpm test:unit`, then run `pnpm test` with `TEST_DATABASE_URL` (`ccg_public_test`) set and distinct from `DATABASE_URL`; verify both suites exit `0` and that lead mutations run against `TEST_DATABASE_URL` only.
- [x] 3.2 Check whether Playwright browsers are installed on `C:\Users\Draven Chen\src\ccg-public-web`; if installed, run `pnpm build && pnpm test:e2e` and verify it exits `0`, or if browsers are missing, record `"not run"` and the reason without deleting or skipping test files.

## 4. Build Status Evidence Record

- [x] 4.1 Write `CRIMSUN_POOL/BUILD_STATUS_CCG_WEBSITE.md` listing each command executed, the date, the exit code (or `"not run"` with reason for e2e), and the directory tree it ran on; verify the file exists, contains zero passwords or connection strings, and leaves `CRIMSUN_POOL/BACKLOG_CCG_WEBSITE.md` checkboxes untouched.
