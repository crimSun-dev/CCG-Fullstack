# Tasks

## 1. Account & Verification

- [x] 1.1 Add `STAFF` to supported roles and add `VerificationCode` schema/migration for single-use email codes; verify with `pnpm prisma generate`.
- [x] 1.2 Implement public `MEMBER` self-registration with email, password, and full name in `SessionService` and registration routes; verify with unit tests for hashing, role default, and duplicate email prevention.
- [x] 1.3 Add signed-in account management routes for full name update, password change, and email change; verify with unit tests covering valid and invalid credential updates.
- [x] 1.4 Implement password reset and email change one-time code dispatch via Resend using the CCG mark and brand palette, with public host URL resolution; verify email rendering and code expiration/single-use behavior.
- [x] 1.5 Verify that Google sign-in and CLI-created `ADMIN`/`EDITOR` accounts continue to authenticate and navigate to their respective views.

## 2. Staff Portal & Enquiries

- [x] 2.1 Create role management portal allowing any authenticated `ADMIN` account to view registered users and assign/clear the `STAFF` role; verify access is rejected for `MEMBER` and `STAFF`.
- [x] 2.2 Update enquiry/lead authorization to allow `STAFF`, `EDITOR`, and `ADMIN` roles to read contact leads, while blocking `MEMBER` access; verify with route tests.
- [x] 2.3 Place the supplied `ck-virtual-lab.png` button on the account/admin view, displaying it exclusively to `STAFF`, `EDITOR`, and `ADMIN`; verify visibility across roles.

## 3. CK Virtual Lab Integration

- [x] 3.1 Implement HMAC-signed assertion generation containing email, full name, and role upon activating the lab button, excluding passwords; verify token signing and payload structure.
- [x] 3.2 Update CK Virtual Lab assertion receiver to validate the token, associate the email with the person record, display the verified full name, and skip the manual name picker; verify seamless login without name sheet prompt.
- [x] 3.3 Verify direct unauthenticated visits to CK Virtual Lab continue using the guest name picker, notes, hall bookings, and live updates without regressions. (Superseded by group 4: the guest flow is removed.)

## 4. Staff-only lab

- [x] 4.1 Create a lab session (HttpOnly cookie, hashed token, one working day) when a CCG assertion is accepted; add sign-out; verify cookie flags, expiry, and revocation.
- [x] 4.2 Require the session for the page, its assets, `/ce-config.js`, every `/v1` route, and the `/v1/live` WebSocket; serve unauthenticated visitors only a "sign in through CCG" page; verify each surface refuses without a session.
- [x] 4.3 Derive the acting person from the session in hub and note writes, refuse a mismatched `me`, and remove guest name creation; remove the name picker from the page; verify impersonation is refused.
- [x] 4.4 Revoke the `anonymous` and `authenticated` Data API grants on the `wall` schema; verify both roles are refused.
- [x] 4.5 Make `LAB_ASSERTION_SECRET` required so the lab fails closed; update the existing lab tests to sign in, and rerun the full suite.
