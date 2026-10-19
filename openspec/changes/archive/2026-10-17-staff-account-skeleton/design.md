## Context

See `proposal.md` — Why for motivation. Source of authority: `CRIMSUN_POOL/UNIFIED_DECISION_MANIFEST_CCG_WEBSITE.md` and `CRIMSUN_POOL/TDD_CCG_WEBSITE.md` (with pool snapshot `CRIMSUN_POOL/POOL_INDEX_CCG_WEB_2026-10-17.md` and experience snapshot `CRIMSUN_POOL/EXPERIENCE_INDEX_CCG_WEB_2026-10-17.md`).

### Observed Codebase State (Verified on Disk)

- **Schema (`web/prisma/schema.prisma`)**:
  - `AdminUser` (`@@map("admin_user")`): `id` (`String @id @default(uuid()) @db.Uuid`), `email` (`String @unique`), `name` (`String`), `passwordHash` (`String @map("password_hash")`), `role` (`String`), `sessions` (`AdminSession[]`).
  - `AdminSession` (`@@map("admin_session")`): `id` (`String @id @default(uuid()) @db.Uuid`), `userId` (`String @map("user_id") @db.Uuid`), `user` (`AdminUser`), `tokenHash` (`String @unique @map("token_hash")`), `expiresAt` (`DateTime @map("expires_at")`), `revokedAt` (`DateTime? @map("revoked_at")`).
  - There is no public `User` model, no `username` column, and no Google subject column.
- **Login Route (`web/src/app/admin/login/route.ts`)**: `GET` and `POST` share `/admin/login`. `GET` redirects an already signed-in admin (`303`) to `/admin` and otherwise returns the plain HTML sign-in form (`200`, `Cache-Control: no-store`). `POST` enforces `isSameOrigin(req)` (`403` on cross-origin), reads `email` and `password` from form data, returns `401` with `"Email or password is incorrect."` on failure, and on success appends `Set-Cookie` via `sessionCookie(result.token)` and redirects (`303`) to `/admin`.
- **Admin Gate (`web/src/app/admin/page.tsx`)**: Calls `currentAdmin()`; redirects anonymous visitors to `/admin/login`. Renders `"Signed in as {admin.name} ({admin.role})"` and a `POST /admin/logout` sign-out form.
- **Logout Route (`web/src/app/admin/logout/route.ts`)**: Enforces `isSameOrigin(req)`, revokes the session row via `sessionService().revoke(token)` (`revokedAt = new Date()`), appends `clearedSessionCookie()`, and redirects (`303`) to `/admin/login`.
- **Session & Cookie Services (`web/src/lib/session-service.ts`, `web/src/lib/admin-auth.ts`)**: `SESSION_COOKIE = "ccg_session"`, `SESSION_TTL_SECONDS = 7 * 24 * 60 * 60` (7 days), `BCRYPT_COST = 12`. `login()` normalizes email (`email.trim().toLowerCase()`), compares against `DUMMY_HASH` when the email is unknown for constant-time misses, generates a 32-byte `base64url` token, and persists only `hashToken(token)` (SHA-256 hex). Cookie flags: `Path=/; HttpOnly; SameSite=Lax; Max-Age=...` plus `Secure` when `NODE_ENV === "production"`.
- **CLI Account Creation (`web/scripts/create-admin.ts`, `web/README.md`)**: `ADMIN_PASSWORD='12+ chars' pnpm admin:create you@example.com "Your Name" ADMIN`. Enforces roles `ADMIN` or `EDITOR` (`RULE-009` in `FULLSTACK_JS_STRATEGIES_2025`, `RULE-024` in `SYSTEM_DESIGN_FULLSTACK_PRODUCTION`) and minimum 12-character password from `ADMIN_PASSWORD`.
- **Build & Test Evidence (`CRIMSUN_POOL/BUILD_STATUS_CCG_WEBSITE.md`, 2026-10-17)**: Records `pnpm build`, `pnpm test:unit` (20/20), `pnpm test` (42/42), and `pnpm build && pnpm test:e2e` (23/23) all exiting `0` on the NTFS copy (`C:\Users\Draven Chen\src\ccg-public-web`). This note is newer evidence than the README's "skeleton exists" line.

## Goals / Non-Goals

**Goals:**
- Publish `CRIMSUN_POOL/ACCOUNT_SKELETON_CCG_WEBSITE.md` as the single account contract that later visual design and OpenID Connect passes can read without opening `schema.prisma`.
- Preserve `AdminUser`, `AdminSession`, `/admin/login`, `/admin/logout`, `/admin`, and the database seed with zero code or schema edits.

**Non-Goals:**
- Public registration, a public `User` model, `username` columns, or self-serve password flows.
- Implementing Google sign-in, OpenID Connect, or any provider button in this change.
- Adding a second session table or storing tokens in `localStorage`.
- Visual design, CSS, deck photos (`CLARIFY-002`), or Erry's title (`CLARIFY-001`).
- Deploying to Neon or Vercel, or editing `UNIFIED_DECISION_MANIFEST_CCG_WEBSITE.md`, `TDD_CCG_WEBSITE.md`, or `BACKLOG_CCG_WEBSITE.md` checkboxes.

## Decisions

### Why This Shape

1. **The visitor write path is the lead row.** The TDD's visitor reads pages and may submit a lead. Staff are created with `pnpm admin:create`. This change names that staff editor as the account holder (`TDD_CCG_WEBSITE.md` visitor/lead section; `web/README.md` admin create command).
2. **Avoid `MISTAKE-001` (`EXCEL_WORKFLOW_HISTORY`, `IMPACT-HIGH`).** `MISTAKE-001` froze canonical columns before the real file existed, and the first real file used different names. This change differs because it adds no columns. It publishes the columns the green build already stores: `email`, `name`, `passwordHash`, `role`, and a session row (`AdminSession`). Adding a `username`, a Google subject (`google_sub`), or a public `User` table before a real requirement exists would repeat that mistake.
3. **One owner of a concern (`RULE-001` and `MISTAKE-001`, `TINY_SWORDS_LAST_STAND_HISTORY`, `TIMELESS`).** `AdminSession` is the only owner of "who is logged in." Introducing a second account or session table would create a second owner.
4. **Google sign-in is a later change that inherits strict identity rules.** When Google sign-in is cut later on top of this skeleton, `RULE-030` (`SYSTEM_DESIGN_FULLSTACK_PRODUCTION`) requires OpenID Connect on top of OAuth 2 because OAuth 2 alone does not establish identity (`AXIOM-028`, `TRAP-007`). The browser credential stays the `HttpOnly` session cookie (`CHECK-015`, `FULLSTACK_WEB_SAMMIE_SMITH`) backed by `AdminSession`, and any password that remains stays a bcrypt hash (`AXIOM-007`, `FULLSTACK_WEB_SAMMIE_SMITH`). Those rules are recorded in the contract note so the later change inherits them; they are not implemented here.
5. **Correct citation boundary for `VETO-A1`.** `VETO-A1` in `UNIFIED_DECISION_MANIFEST_CCG_WEBSITE.md` forbids splitting the site into Nest, a worker, and Redis. It does not decide who an account is for, and is not cited as the staff-only rule.

### Decision Matrix

| Fork | Decision | Rejected | Authority |
|---|---|---|---|
| Who the account is | The staff editor created by `pnpm admin:create` | A public member, a camp applicant, or a visitor account | TDD visitor is a reader who may leave a lead. The user asked for a skeleton and did not name a public member |
| What "skeleton" means | The existing tables, the existing login gate, and one contract note for the later design | New pages, new CSS, a register form, a password-change form | "No functionalities yet." The login screen already exists |
| New columns | None | `username`, `google_sub`, a nullable provider id | `MISTAKE-001` (`EXCEL_WORKFLOW_HISTORY`). Pool gap: nothing defines those columns |
| Session owner | `AdminSession` only, `HttpOnly` cookie already in use | A second session table, a JWT in `localStorage` | `TINY_SWORDS_LAST_STAND_HISTORY` `RULE-001` / `MISTAKE-001`. Manifest `VETO-A2` |
| Passwords | Remain bcrypt hashes, set by the CLI | A reversible password, a "set password" UI | `AXIOM-007` (`FULLSTACK_WEB_SAMMIE_SMITH`) |
| Google | Out of this change. The contract note says the later button is OpenID Connect and still ends in `AdminSession` | Implementing the button, or storing an OAuth access token as the session | `RULE-030`, `AXIOM-028`, `TRAP-007` (`SYSTEM_DESIGN_FULLSTACK_PRODUCTION`); `CHECK-015` (`FULLSTACK_WEB_SAMMIE_SMITH`) |
| Where Next runs | NTFS copy (`C:\Users\Draven Chen\src\ccg-public-web`), and only if a test is re-run | `pnpm dev` or `pnpm build` on `G:` | `BUILD_STATUS_CCG_WEBSITE.md` |
| Application code | Leave it unless a cited file disagrees with this prompt. A disagreement stops the change and gets reported | A refactor of login while "adding the skeleton" | This change records the foundation. It does not replace it |

### Pool Gaps

- No pool entry defines a `username`, a visitor "set password" flow, or how a Google subject attaches to `AdminUser`. That absence is why those columns are out of scope.
- The later visual design has no pool entry that assigns deck photos to routes. `CLARIFY-002` stays open and is not part of this change.

## Risks / Trade-offs

- **[Risk] Product owner intended a public member account rather than staff** → **Stop condition**: If the product owner says the account is a public member, stop immediately. Do not add tables inside this change; that requires a separate proposal.
- **[Risk] Drift between documented fields and actual source files** → **Mitigation**: Task 1 re-reads `schema.prisma`, `/admin/login`, `/admin/logout`, and `/admin/page.tsx` and quotes the exact field list from disk; if any field disagrees with the prompt, execution stops and reports the discrepancy rather than editing application code.
- **[Risk] Running Next.js commands on the exFAT `G:` drive** → **Mitigation**: Writing `CRIMSUN_POOL/ACCOUNT_SKELETON_CCG_WEBSITE.md` is pure Markdown on `G:`. Any `pnpm` command that invokes Next or Vitest/Playwright runs exclusively on the NTFS copy (`C:\Users\Draven Chen\src\ccg-public-web`), or cites the green 2026-10-17 run in `CRIMSUN_POOL/BUILD_STATUS_CCG_WEBSITE.md`.
