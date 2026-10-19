## Context

See `proposal.md` — Why for motivation. Source of authority: `CRIMSUN_POOL/ACCOUNT_SKELETON_CCG_WEBSITE.md`, `CRIMSUN_POOL/UNIFIED_DECISION_MANIFEST_CCG_WEBSITE.md`, and `CRIMSUN_POOL/TDD_CCG_WEBSITE.md` (with pool snapshot `CRIMSUN_POOL/POOL_INDEX_CCG_WEB_2026-10-17.md` and experience snapshot `CRIMSUN_POOL/EXPERIENCE_INDEX_CCG_WEB_2026-10-17.md`).

### Observed Codebase State (Verified on Disk)

- **Account Skeleton Contract (`CRIMSUN_POOL/ACCOUNT_SKELETON_CCG_WEBSITE.md`)**: Names the staff editor created via `pnpm admin:create` as the sole account holder. Current `AdminUser` fields: `id`, `email` (unique), `name`, `passwordHash`, `role`, `sessions`. Current `AdminSession` fields: `id`, `userId`, `tokenHash` (unique), `expiresAt`, `revokedAt`. There is no Google subject column yet.
- **Login Route (`web/src/app/admin/login/route.ts`)**: `GET /admin/login` renders the plain HTML email and password form (`200`, `Cache-Control: no-store`, or `303` to `/admin` if already signed in). `POST /admin/login` checks same-origin (`403` otherwise), verifies bcrypt password via `sessionService().login(email, password)`, sets `ccg_session` (`HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=604800`, `Secure` in production) and responds `303` to `/admin` on success, or `401` with `"Email or password is incorrect."` and no cookie on failure.
- **Logout & Admin Gate (`web/src/app/admin/logout/route.ts`, `web/src/app/admin/page.tsx`)**: `POST /admin/logout` sets `revokedAt` on the session row and clears `ccg_session`. `/admin` redirects any anonymous, revoked, or expired session to `/admin/login`.
- **Roles (`web/scripts/create-admin.ts`, `web/src/lib/session-service.ts`)**: Roles remain `ADMIN` and `EDITOR`; `create-admin.ts` rejects any other role.
- **Build & Test Baseline (`CRIMSUN_POOL/BUILD_STATUS_CCG_WEBSITE.md`)**: Records the 2026-10-17 green build and tests on the NTFS copy (`C:\Users\Draven Chen\src\ccg-public-web`). Those runs had no Google sign-in; new tests in this change must execute and pass on the NTFS copy rather than citing the old run as proof of Google sign-in.

## Goals / Non-Goals

**Goals:**
- Allow an existing `AdminUser` row created via `pnpm admin:create` to sign in with Google using OpenID Connect (`RULE-030`), linking the Google `sub` claim after a first-time verified email match and using the stored `sub` on subsequent sign-ins.
- Reuse `AdminSession` and the `ccg_session` `HttpOnly` cookie as the sole signed-in state while keeping email-and-password login working.
- Degrade cleanly when `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` is not set so password login still works and the Google control explains that it is unavailable.
- Update `CRIMSUN_POOL/ACCOUNT_SKELETON_CCG_WEBSITE.md` and append fresh test/build evidence to `CRIMSUN_POOL/BUILD_STATUS_CCG_WEBSITE.md`.

**Non-Goals:**
- Public registration, a public `User` model, `username` columns, or a self-serve password screen.
- Creating an `AdminUser` row automatically from a Google login.
- A second session table, storing a JWT in `localStorage`, or using a Google OAuth 2 access token as the browser session.
- Visual design, CSS, deck photos (`CLARIFY-002`), or Erry's title (`CLARIFY-001`).
- Neon, Vercel, or a production Google redirect URL.
- Editing `UNIFIED_DECISION_MANIFEST_CCG_WEBSITE.md`, `TDD_CCG_WEBSITE.md`, or `BACKLOG_CCG_WEBSITE.md`.
- Printing or committing `.env` or any client secret.

## Decisions

### Why This Shape

1. **Fulfilling the account skeleton inheritance contract (`ACCOUNT_SKELETON_CCG_WEBSITE.md`).** `ACCOUNT_SKELETON_CCG_WEBSITE.md` names the account holder as the staff editor from `pnpm admin:create` and specifies that a later Google change inherits OpenID Connect, keeps `ccg_session`, and must decide how a Google identity attaches to `AdminUser`. This change makes that attachment decision.
2. **OpenID Connect for identity (`RULE-030`, `AXIOM-028`, `TRAP-007` in `SYSTEM_DESIGN_FULLSTACK_PRODUCTION`).** Sign-in with Google uses OpenID Connect on top of OAuth 2 because the signed ID token carries verified identity claims (`sub`, `email`, `email_verified`). OAuth 2 alone is authorization; an access token is not proof of identity and is never used as the session.
3. **App-owned session cookie and bcrypt password coexistence (`CHECK-015`, `AXIOM-007` in `FULLSTACK_WEB_SAMMIE_SMITH`).** The browser credential remains the app's own `ccg_session` `HttpOnly` cookie, and `passwordHash` remains a required bcrypt (cost 12) hash on `AdminUser`.
4. **One owner of signed-in state (`RULE-001` and `MISTAKE-001` in `TINY_SWORDS_LAST_STAND_HISTORY`, `TIMELESS`; Manifest `VETO-A2`).** `AdminSession` remains the sole owner of who is signed in. No second session table and no token in `localStorage` are introduced.
5. **Why adding `google_sub` now avoids `MISTAKE-001` (`EXCEL_WORKFLOW_HISTORY`, `IMPACT-HIGH`).** `MISTAKE-001` froze columns before the real record existed. Here, the `AdminUser` staff row already exists in production schema and tests. The only new column is a nullable unique Google subject (`googleSub` mapped to `google_sub` on `admin_user`), populated only after a verified Google email matches an existing staff row. Unknown Google accounts create no row, and `username`, public `User`, and password-change screens stay absent.

### Link Decision (Pool Gap — Labeled **INFERENCE**)

**INFERENCE** (derived from `RULE-030` in `SYSTEM_DESIGN_FULLSTACK_PRODUCTION`—the OpenID Connect ID token carries identity—combined with the unique `AdminUser.email` that already identifies the staff row):

1. Read and verify the OpenID Connect ID token. Require the `email_verified` claim to be `true` (verified by Google) and `sub` and `email` to be non-empty.
2. If an `AdminUser` row already has this Google subject (`googleSub`) stored, that row is the account.
3. If no row has that Google subject stored yet, match the lowercased verified email (`email.trim().toLowerCase()`) to `AdminUser.email` (where `googleSub` is currently `null`). On a match, store the Google subject (`googleSub = sub`) on that row, then create an `AdminSession` and sign in.
4. If neither match hits (or if the matched email row is already bound to a different `googleSub`), show the same `401` failure as a bad password (`"Email or password is incorrect."`) and write no user and no session.

The Google subject (`sub`) is the durable link after the first success; the verified email is only the initial introduction to a staff row that was created from the command line.

### Decision Matrix

| Fork | Decision | Rejected | Authority |
|---|---|---|---|
| Who may sign in with Google | An existing staff row | Creating an `AdminUser` from a Google account | Account skeleton stop condition. Visitors leave a lead |
| Protocol | OpenID Connect, and the ID token is the identity | Treating the OAuth 2 access token as the login | `RULE-030`, `AXIOM-028`, `TRAP-007` (`SYSTEM_DESIGN_FULLSTACK_PRODUCTION`) |
| First link | Verified email equals `AdminUser.email`, then store the Google subject on that row | A subject column filled for every staff row in advance, or a match on an unverified email | **INFERENCE** from `RULE-030` plus the existing unique email. `MISTAKE-001` (`EXCEL_WORKFLOW_HISTORY`) |
| Later sign-ins | Look up the stored subject first | Looking up by email forever, so a Google email change silently binds a different person | Same **INFERENCE**. The subject is the durable id inside the ID token |
| Signed-in state | New `AdminSession` row and `ccg_session` | A second cookie, a JWT in `localStorage`, or storing the Google access token as the session | `CHECK-015` (`FULLSTACK_WEB_SAMMIE_SMITH`). `TINY_SWORDS_LAST_STAND_HISTORY` `RULE-001`. Manifest `VETO-A2` |
| Password | The email form and bcrypt hash stay | Removing password login in the same change | `AXIOM-007` (`FULLSTACK_WEB_SAMMIE_SMITH`). The skeleton's create command stays valid |
| Secrets | `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` live in `.env` on the NTFS copy. `.env` stays gitignored | Committing a client secret, or inventing one | `TRAP-016` and `RULE-034` (`FULLSTACK_JS_STRATEGIES_2025`) |
| Missing Google client | Stop and ask if live manual OAuth is requested; in code, the login form keeps working with email and password and the Google control explains that it is unavailable | A fake client id, or a button that calls Google with placeholder credentials | The 2026-10-17 build already proved placeholder database credentials fail closed |
| Where Next runs | NTFS copy (`C:\Users\Draven Chen\src\ccg-public-web`) | `pnpm dev` or `pnpm build` on `G:` | `BUILD_STATUS_CCG_WEBSITE.md` |

### Pool Gaps

- The email-then-subject order is an **INFERENCE**. No pool entry specifies it. If a later staff member must sign in with a Google address that differs from the email stored by `pnpm admin:create`, that is a new change: an admin binds the subject by hand. This change does not build that screen.
- No pool entry defines a visitor username or a visitor set-password flow. Those stay out.

## Risks / Trade-offs

- **[Risk] Product owner intended a visitor or camp applicant to sign in with Google** → **Stop condition**: If the product owner says a visitor or a camp applicant should sign in with Google, stop immediately. Do not add a public account inside this change.
- **[Risk] Missing live Google OAuth credentials in local `.env`** → **Mitigation**: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are optional at boot so `pnpm build` and password login continue working when they are unset, and `/admin/login` renders the Google control in an unavailable state with an explanation rather than calling Google with placeholder credentials. Automated tests mock Google's token endpoint and never contact Google's live servers.
- **[Risk] exFAT junction failure on `G:`** → **Mitigation**: All `pnpm` commands (`prisma migrate`, `pnpm test`, `pnpm build`) run on `C:\Users\Draven Chen\src\ccg-public-web`, with source files kept in sync between `G:` and the NTFS copy.

## Migration Plan

1. Add `googleSub String? @unique @map("google_sub")` to `AdminUser` in `web/prisma/schema.prisma` (keeping `passwordHash` required) and create a Prisma 7.10 migration adding the nullable column `google_sub TEXT` and unique index `admin_user_google_sub_key` on `admin_user`.
2. Apply the migration on the NTFS copy (`C:\Users\Draven Chen\src\ccg-public-web`) via `pnpm db:migrate` and regenerate the Prisma client (`pnpm db:generate`).
3. Rollback, if ever needed before production cutover, drops `admin_user_google_sub_key` and column `google_sub` without affecting existing `AdminUser` rows or password sessions.
