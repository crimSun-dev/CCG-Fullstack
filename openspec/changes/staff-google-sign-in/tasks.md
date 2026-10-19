## 1. Baseline Verification and Schema Migration

- [x] 1.1 Re-read `CRIMSUN_POOL/ACCOUNT_SKELETON_CCG_WEBSITE.md`, `AdminUser` and `AdminSession` in `web/prisma/schema.prisma`, `web/src/app/admin/login/route.ts`, `web/src/lib/session-service.ts`, and `web/src/lib/admin-auth.ts`; verify that `SESSION_COOKIE` is `"ccg_session"` before adding the Google control.
- [ ] 1.2 Add one nullable unique Google subject column (`googleSub String? @unique @map("google_sub")`) on `AdminUser` (`admin_user`) via a Prisma 7.10 migration while keeping `passwordHash` required and adding no `username` column or public user table; apply the migration and regenerate the Prisma client on the NTFS copy (`C:\Users\Draven Chen\src\ccg-public-web`) and verify `pnpm check:prisma-pin` and `pnpm db:migrate` exit `0`.

## 2. OpenID Connect Routes, Link Logic, and Login Screen Control

- [x] 2.1 Add the Google OpenID Connect start and return routes beside `/admin/login` and extend `SessionService` to verify the ID token and apply the 4-step link order (require `email_verified: true`; match by stored `googleSub` first; otherwise match lowercased verified `email` to `AdminUser.email`, store `googleSub`, and create an `AdminSession`; otherwise reject with `401` and write no user and no session), calling the existing session creation and `sessionCookie()` helper so cookie flags match the skeleton.
- [x] 2.2 Add the Google sign-in control on the existing `/admin/login` screen while keeping the email and password form intact; verify that when `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` is missing, the password form still works, the Google control explains that it is unavailable, and no placeholder or fabricated credentials are used.

## 3. Automated Tests on the NTFS Copy

- [x] 3.1 Add automated tests on `C:\Users\Draven Chen\src\ccg-public-web` with mocked Google token responses (never calling Google's live servers) covering: (a) a matching verified email links `googleSub` and signs in, (b) a second sign-in resolves via the stored `googleSub`, (c) an unknown verified email writes nothing and returns failure, (d) an unverified email (`email_verified: false`) writes nothing and returns failure, (e) email and password login still works, and (f) logout revokes a Google-started session.

## 4. Contract Update, Build Verification, and Evidence Recording

- [x] 4.1 Update `CRIMSUN_POOL/ACCOUNT_SKELETON_CCG_WEBSITE.md` so the `AdminUser` field list includes the Google subject column (`googleSub` / `google_sub`) and the intentionally absent list no longer states that the Google subject column is absent, while leaving `CRIMSUN_POOL/BACKLOG_CCG_WEBSITE.md`, `CRIMSUN_POOL/TDD_CCG_WEBSITE.md`, and `CRIMSUN_POOL/UNIFIED_DECISION_MANIFEST_CCG_WEBSITE.md` unchanged.
- [x] 4.2 Sync source files between `G:` and `C:\Users\Draven Chen\src\ccg-public-web`, run `pnpm test` and `pnpm build` on the NTFS copy, verify both exit `0`, and record the commands and exit codes as a new dated section in `CRIMSUN_POOL/BUILD_STATUS_CCG_WEBSITE.md` with zero connection strings and zero client secrets.
