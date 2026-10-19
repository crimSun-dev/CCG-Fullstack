# Design: Public accounts and staff access to CK Virtual Lab

## Context

See `proposal.md` for motivation. Currently, `AdminUser` and `AdminSession` manage administrative access with roles (`ADMIN`, `EDITOR`, `MEMBER`), with Google sign-in support. CK Virtual Lab operates on a separate Neon database where people are identified by display names (`people.display_name`) without email addresses. `PRODUCT.md` historically defined public self-service registration and password reset as absent.

## Goals / Non-Goals

**Goals:**
- Extend `AdminUser` to support self-service member registration, full name updates, and password changes.
- Add `STAFF` role and allow any `ADMIN` account to assign or revoke the `STAFF` role via an admin portal.
- Deliver single-use verification codes for password resets and email changes styled with CCG brand colors and mark.
- Enable `STAFF`, `EDITOR`, and `ADMIN` accounts to view contact leads and see the CK Virtual Lab button.
- Implement a cryptographically signed assertion mechanism to pass verified email, full name, and role to the Virtual Lab.
- In the lab, display the account's full name and skip the manual name picker while preserving the unauthenticated guest workflow.

**Non-Goals:**
- Merging the CCG and CK Virtual Lab databases.
- Adding public staff directories or authenticator app (TOTP) 2FA.
- Removing or disrupting the existing guest display name picker for direct lab visitors.

## Decisions

### Decision: Reuse `AdminUser` for public accounts
Extend the existing `AdminUser` model and `SessionService` to handle `MEMBER` registrations rather than creating a separate table.
- *Rationale*: Avoids duplicate user concepts, dual cookies, and redundant auth middleware.
- *Alternatives considered*: A dedicated `CustomerUser` table (rejected: doubles session logic and complicates role promotion).

### Decision: Every ADMIN assigns the STAFF role
Any authenticated account with the `ADMIN` role can access the role management portal to grant or revoke `STAFF`.
- *Rationale*: Allows operational flexibility across all designated admins while preventing non-admin members or staff from modifying roles.
- *Alternatives considered*: Hardcoding a single owner email (rejected per user preference for `(every admin)`).

### Decision: Decoupled architecture via signed assertions
CCG issues a short-lived HMAC-signed token (containing email, full name, role, timestamp) when launching the lab; the lab validates the signature using a shared secret.
- *Rationale*: Guarantees zero credential leakage, eliminates cross-database network dependencies, and keeps Neon databases strictly isolated.
- *Alternatives considered*: Direct database linkage or shared connection strings (rejected: couples migration lifecycles and violates database boundary).

### Decision: Email verification codes via Resend
Send single-use 6-digit verification codes using the existing Resend client, styled with the CCG mark and brand blues (`#030507`, `#1088f8`, `#3e9ff8`, `#70b8f8`).
- *Rationale*: Consistent user experience matching existing enquiry notifications; no extra third-party auth dependencies.
- *Host resolution*: URLs generated in emails use the canonical site origin rather than local bind addresses (0.0.0.0).

### Decision: Privacy-preserving password reset responses
Password reset requests for non-existent emails return a generic confirmation message without disclosing account existence.
- *Rationale*: Prevents email enumeration attacks against the user directory.

## Risks / Trade-offs

- **[Risk]** Name collisions in CK Virtual Lab when a staff member's full name matches an existing guest record.
  - **Mitigation:** The lab associates the verified email with the person record upon assertion validation; if the name matches a record already tied to a different email, disambiguate or create a distinct person record to prevent record hijacking.
- **[Risk]** Email delivery delay during password reset.
  - **Mitigation:** Verification codes have a 15-minute expiration window with resend rate limiting.

## File Changes

- `web/prisma/schema.prisma` & migration: Add `VerificationCode` model, support `STAFF` role in queries.
- `web/src/lib/session-service.ts`: Implement registration, role updates, profile editing, and password reset workflows.
- `web/src/lib/token-assertion.ts` (new): Issue HMAC-signed tokens for Virtual Lab handoff.
- `web/src/lib/mailer.ts`: Add verification email templates styled with CCG mark and palette.
- `web/src/app/(auth)/`: Add register, forgot-password, and reset-password routes.
- `web/src/app/account/`: Add profile edit (full name, email, password) and Virtual Lab button.
- `web/src/app/admin/users/`: Add role management portal for admins.
- `web/src/app/admin/leads/`: Update authorization to permit `STAFF` access.
- `web/public/brand/ck-virtual-lab.png`: Asset for Virtual Lab launch button.
- `web/PRODUCT.md`: Document public accounts, self-service maintenance, and staff lab access.
- CK Virtual Lab / Virtual Office: Update assertion verification endpoint to consume CCG token and map display name/email.
