## Why

Staff editors already provisioned via `pnpm admin:create` need to be able to sign in with Google using OpenID Connect (`RULE-030`, `SYSTEM_DESIGN_FULLSTACK_PRODUCTION`) without creating public accounts or a second session system (`CHECK-015`, `FULLSTACK_WEB_SAMMIE_SMITH`; `RULE-001`, `TINY_SWORDS_LAST_STAND_HISTORY`). Because `AdminUser` rows already exist (`ACCOUNT_SKELETON_CCG_WEBSITE.md`), adding a single nullable unique Google subject column on `admin_user`—populated only after a verified Google email matches an existing staff row—provides durable OpenID Connect identity linking without repeating `MISTAKE-001` (`EXCEL_WORKFLOW_HISTORY`).

## What Changes

- Add one nullable unique Google subject column (`googleSub` / `google_sub`) on `AdminUser` (`admin_user`) via a Prisma 7.10 migration while keeping `passwordHash` required and adding no `username` column or public user table.
- Add Google OpenID Connect sign-in start and callback routes alongside `/admin/login` that verify the ID token, require a verified email claim, resolve the account by stored Google subject first and by lowercased verified email second (persisting the Google subject on first match), and issue the existing `AdminSession` row and `ccg_session` `HttpOnly` cookie.
- Reject any unverified Google email or any Google account that matches no existing `AdminUser` row with the login failure response (`401`, no user created, no session created, no cookie set).
- Add a Google sign-in control to `/admin/login` while keeping the existing email and password form working; if `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` is missing, keep password login working and display that Google sign-in is unavailable without inventing placeholder credentials.
- Update `CRIMSUN_POOL/ACCOUNT_SKELETON_CCG_WEBSITE.md` to include the Google subject column in the stored field list and remove it from the intentionally absent list, and record new test and build results in `CRIMSUN_POOL/BUILD_STATUS_CCG_WEBSITE.md`.

## Capabilities

### New Capabilities
- `staff-google-sign-in`: Defines the behavioral contract for staff Google OpenID Connect sign-in, subject-first then verified-email-second account linking on existing `AdminUser` rows, rejection of unknown or unverified Google identities, graceful degradation when Google credentials are unconfigured, continued password login and session revocation, and preservation of the three-program public catalog and visitor lead flow.

### Modified Capabilities
<!-- None. Existing `local-build-proof` and `staff-account-skeleton` requirements remain intact. -->

## Impact

- **Database & Schema (`web/prisma/schema.prisma`, `web/prisma/migrations/`)**: Adds nullable unique `google_sub` column on `admin_user` via a Prisma 7.10 migration; `password_hash` remains `NOT NULL`.
- **Auth & Admin Routes (`web/src/app/admin/login/`, `web/src/lib/session-service.ts`, `web/src/lib/env.ts`)**: Adds Google OIDC start and callback handlers, ID token verification, subject/email link logic in `SessionService`, and optional `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` environment configuration.
- **Tests (`web/tests/`)**: Adds database and/or route tests on the NTFS copy (`C:\Users\Draven Chen\src\ccg-public-web`) with mocked Google token responses covering first-time verified email linking, subsequent subject lookup, unknown email rejection, unverified email rejection, password login coexistence, and logout revocation.
- **Contract & Build Notes (`CRIMSUN_POOL/`)**: Updates `CRIMSUN_POOL/ACCOUNT_SKELETON_CCG_WEBSITE.md` and appends a new dated section to `CRIMSUN_POOL/BUILD_STATUS_CCG_WEBSITE.md`; leaves `BACKLOG_CCG_WEBSITE.md`, `TDD_CCG_WEBSITE.md`, and `UNIFIED_DECISION_MANIFEST_CCG_WEBSITE.md` unchanged.
