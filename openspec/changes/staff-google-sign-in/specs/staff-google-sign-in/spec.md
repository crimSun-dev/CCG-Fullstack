## Purpose

Defines the behavioral contract for staff Google OpenID Connect sign-in on the CK Coaching Group public site, allowing existing command-line-provisioned staff accounts to authenticate with Google, link their durable Google subject after an initial verified email match, and establish the same revocable `ccg_session` cookie session while rejecting unknown or unverified Google identities.

## ADDED Requirements

### Requirement: Staff Google OpenID Connect sign-in initiation and credential availability
The login screen at `/admin/login` SHALL display a Google sign-in control alongside the existing email and password form so a staff member with an existing account record can initiate OpenID Connect authentication with Google; if Google client credentials (`GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET`) are not configured, the email and password form MUST remain functional and the Google sign-in control SHALL explain that Google sign-in is unavailable without sending requests with placeholder credentials.

#### Scenario: Staff member initiates Google sign-in when credentials are configured
- **WHEN** a staff member visits `/admin/login` and activates the Google sign-in control while `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are configured
- **THEN** the system initiates the OpenID Connect authorization request with CSRF state protection and redirects the browser to the Google authorization endpoint

#### Scenario: Missing Google client credentials leave password login working
- **WHEN** `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` is absent from the environment and a staff member loads `/admin/login`
- **THEN** the email and password form remains operational, the login screen indicates that Google sign-in is unavailable, and no request is made with fabricated or placeholder client credentials

### Requirement: First-time verified email match links the Google subject and establishes a staff session
When Google OpenID Connect authentication returns an ID token whose email claim is verified and matches the normalized email of an existing staff record that has no Google subject stored yet, the system SHALL persist the Google subject (`sub`) on that staff record, create a staff session record, set the `HttpOnly` `ccg_session` cookie, and redirect (`303`) the browser to `/admin`.

#### Scenario: First Google sign-in links verified email to existing staff record
- **WHEN** a staff member completes Google sign-in and the verified ID token contains `email_verified: true` and an `email` matching an existing staff record whose Google subject is currently null
- **THEN** the system stores the ID token's `sub` claim on that staff record, creates a session row storing only the SHA-256 hash of the session token, sets the `ccg_session` `HttpOnly` cookie, and redirects (`303`) to `/admin`

### Requirement: Subsequent Google sign-ins resolve by stored Google subject first
When a staff record already has a stored Google subject, the system SHALL resolve the account by matching the ID token's subject (`sub`) to the stored Google subject first and establish a staff session.

#### Scenario: Returning staff member signs in via stored Google subject
- **WHEN** a staff member whose record already stores a Google subject completes Google sign-in with an ID token carrying that same `sub` claim and a verified email
- **THEN** the system resolves the staff record by its stored Google subject, creates a session record, sets the `ccg_session` `HttpOnly` cookie, and redirects (`303`) to `/admin`

### Requirement: Unknown or unverified Google identities are rejected without side effects
The system MUST reject any Google sign-in where the email claim is not verified by Google or where neither the Google subject nor the verified email matches an existing staff record, responding with the login failure (`401` and `"Email or password is incorrect."`), setting no session cookie, and inserting no user record and no session record.

#### Scenario: Verified Google email matching no staff record is rejected
- **WHEN** Google returns a valid ID token with a verified email and subject that match no existing staff record
- **THEN** the system responds with HTTP `401` and `"Email or password is incorrect."`, sets no `ccg_session` cookie, and inserts zero user rows and zero session rows

#### Scenario: Unverified Google email matches nothing
- **WHEN** Google returns an ID token with `email_verified: false` (even if the email string matches an existing staff record)
- **THEN** the system rejects the sign-in with HTTP `401` and `"Email or password is incorrect."`, does not store the Google subject, sets no `ccg_session` cookie, and inserts zero session rows

### Requirement: Password login and session revocation remain intact across both sign-in methods
Adding Google sign-in SHALL NOT remove or alter email-and-password authentication or session revocation; signing in with a valid email and password MUST still succeed, a wrong password MUST still fail with HTTP `401`, and `POST /admin/logout` MUST revoke the active session row and clear `ccg_session` regardless of whether the session began with a password or with Google.

#### Scenario: Email and password login still succeeds and rejects bad passwords
- **WHEN** a staff member submits their email and password to `POST /admin/login`
- **THEN** a valid password establishes a `ccg_session` cookie and redirects (`303`) to `/admin`, while an incorrect password returns HTTP `401` with no cookie

#### Scenario: Logout revokes a session that began with Google sign-in
- **WHEN** a staff member who signed in via Google submits a same-origin `POST` request to `/admin/logout`
- **THEN** the system sets the revocation timestamp on the session record, clears the `ccg_session` cookie, redirects (`303`) to `/admin/login`, and rejects any replayed copy of that cookie on `/admin`

### Requirement: Public offer catalog and visitor lead flow remain unchanged
Adding staff Google sign-in SHALL NOT alter the public offer allowlist or visitor write path; the public catalog MUST expose only `leadership-advisory`, `group-coaching`, and `premium-coaching`, `/programs/internship` MUST return HTTP `404`, and visitors MUST continue to submit inquiries via the contact form as lead records without public accounts.

#### Scenario: Public offers and lead capture are unaffected by staff Google sign-in
- **WHEN** an anonymous visitor requests public program pages or submits the contact form
- **THEN** only `leadership-advisory`, `group-coaching`, and `premium-coaching` resolve, `/programs/internship` returns HTTP `404`, and contact submissions create a lead row with no visitor account creation
