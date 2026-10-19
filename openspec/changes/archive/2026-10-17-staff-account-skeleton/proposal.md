## Why

Later visual design work needs a published, authoritative account foundation without inventing premature tables or columns (`MISTAKE-001`, `EXCEL_WORKFLOW_HISTORY`). Since no public member account has been named, the staff account already created by `pnpm admin:create` (`AdminUser`, `AdminSession`, and `/admin/login`) is the account skeleton, and publishing its contract now gives future design and OpenID Connect sign-in passes a single verified baseline to build on.

## What Changes

- Publish the existing staff account model (`AdminUser` and `AdminSession`) and session gate (`/admin/login`, `/admin/logout`, `/admin`) as the sole account skeleton for the CK Coaching Group public site.
- Add `CRIMSUN_POOL/ACCOUNT_SKELETON_CCG_WEBSITE.md` documenting who the account holder is (staff editor created via CLI), the stored fields (`email`, `name`, `passwordHash`, `role`, and session row fields), the two permitted roles (`ADMIN` and `EDITOR`), how the `HttpOnly` session cookie establishes and revokes signed-in state, and what is intentionally absent (public registration, `username`, Google subject, self-serve password UI, and visual design).
- Leave `web/prisma/schema.prisma`, `/admin/login`, `/admin/logout`, `/admin`, and the database seed completely unchanged, adding no tables, columns, routes, or runtime behavior.
- Enforce a stop condition if the product owner clarifies that the intended account is a public member rather than staff.

## Capabilities

### New Capabilities
- `staff-account-skeleton`: Defines the behavioral contract for the staff-only account skeleton, CLI account provisioning, `HttpOnly` session lifecycle, exposed account fields (`email`, `name`, `role` as `ADMIN` or `EDITOR`), secret handling, and preservation of the three-program public catalog and visitor lead flow.

### Modified Capabilities
<!-- None. Existing `local-build-proof` requirements are unchanged. -->

## Impact

- **Documentation / Contract Pool**: Adds `CRIMSUN_POOL/ACCOUNT_SKELETON_CCG_WEBSITE.md` as the reference contract for subsequent visual design and OpenID Connect changes.
- **Database & Schema**: Zero changes to `web/prisma/schema.prisma` (`AdminUser` and `AdminSession` remain as-is; no public `User` table, `username`, or `google_sub` columns).
- **Application Code & Routes**: Zero edits to `web/src/app/admin/login/route.ts`, `web/src/app/admin/logout/route.ts`, `web/src/app/admin/page.tsx`, `web/src/lib/session-service.ts`, `web/src/lib/admin-auth.ts`, or `web/scripts/create-admin.ts`.
- **Verification**: Reuses green verification evidence from `CRIMSUN_POOL/BUILD_STATUS_CCG_WEBSITE.md` on the NTFS copy (`C:\Users\Draven Chen\src\ccg-public-web`); `CRIMSUN_POOL/BACKLOG_CCG_WEBSITE.md` checkboxes remain untouched.
