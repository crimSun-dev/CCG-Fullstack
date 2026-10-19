## 1. Source Verification and Non-Edit Guard

- [x] 1.1 Re-read `AdminUser` and `AdminSession` in `web/prisma/schema.prisma`, `web/src/app/admin/login/route.ts`, `web/src/app/admin/logout/route.ts`, `web/src/app/admin/page.tsx`, `web/src/lib/session-service.ts`, `web/src/lib/admin-auth.ts`, and `web/scripts/create-admin.ts`; verify every field and route behavior matches the proposal prompt and stop immediately to report any discrepancy rather than editing application code.
- [x] 1.2 Confirm `web/prisma/schema.prisma`, `web/src/app/admin/login/route.ts`, `web/src/app/admin/logout/route.ts`, `web/src/app/admin/page.tsx`, and the database seed remain untouched (`git status` / `git diff` shows zero edits under `web/`).

## 2. Publish Account Skeleton Contract Note

- [x] 2.1 Write `CRIMSUN_POOL/ACCOUNT_SKELETON_CCG_WEBSITE.md` quoting the exact field list from `web/prisma/schema.prisma` (`AdminUser`: `id`, `email`, `name`, `passwordHash`, `role`, `sessions`; `AdminSession`: `id`, `userId`, `tokenHash`, `expiresAt`, `revokedAt`) and documenting: who the account holder is (staff editor created via CLI); the fields a later visual design may display (`email`, `name`, `role`); the two roles (`ADMIN` and `EDITOR`); the CLI create command using a placeholder password (`ADMIN_PASSWORD='12+ chars' pnpm admin:create you@example.com "Your Name" ADMIN`) with zero real passwords or connection strings; the `ccg_session` `HttpOnly` cookie session backed by `AdminSession` as the sole signed-in state (including OpenID Connect inheritance rules `RULE-030`, `AXIOM-028`, `TRAP-007`, `CHECK-015`, `AXIOM-007` for any future Google sign-in change); and the explicit absent list (public registration, public `User` model, `username`, Google subject, self-serve password-change screen, visual design); verify the file exists and contains zero secrets.

## 3. Verification Evidence and Backlog Guard

- [x] 3.1 Record verification in `CRIMSUN_POOL/ACCOUNT_SKELETON_CCG_WEBSITE.md` by either citing the green 2026-10-17 suite from `CRIMSUN_POOL/BUILD_STATUS_CCG_WEBSITE.md` or re-running tests exclusively on the NTFS copy (`C:\Users\Draven Chen\src\ccg-public-web`) against `TEST_DATABASE_URL`, explicitly stating which option was used.
- [x] 3.2 Verify that `CRIMSUN_POOL/BACKLOG_CCG_WEBSITE.md` checkboxes, `CRIMSUN_POOL/UNIFIED_DECISION_MANIFEST_CCG_WEBSITE.md`, and `CRIMSUN_POOL/TDD_CCG_WEBSITE.md` have not been modified.
