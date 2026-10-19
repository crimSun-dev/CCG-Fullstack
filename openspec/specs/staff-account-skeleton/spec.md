# staff-account-skeleton Specification

## Purpose

Defines the behavioral contract for the CK Coaching Group staff account skeleton, establishing command-line staff provisioning and the revocable cookie session as the sole account and authentication foundation while prohibiting public registration, plaintext passwords, and unapproved offer exposure.

## Requirements

### Requirement: Staff account provisioning via command line only
An account SHALL be a staff record provisioned exclusively from the command line, and the public site MUST NOT expose any visitor registration or self-service account creation flow.

#### Scenario: Staff account is provisioned from the command line
- **WHEN** an operator invokes the command-line account creation command with a valid email, display name, role (`ADMIN` or `EDITOR`), and a password of at least 12 characters
- **THEN** the system creates or updates the staff account record with a normalized lowercase email and a hashed password

#### Scenario: Public visitor cannot register an account
- **WHEN** a visitor browses the public site or attempts to access account registration
- **THEN** no public sign-up form or registration endpoint exists, and anonymous visitors accessing `/admin` are redirected to `/admin/login`

### Requirement: Single signed-in state via revocable staff session
A staff session delivered via an `HttpOnly` cookie SHALL be the only signed-in state in the system; signing in with a valid staff email and password MUST establish that session, and signing out MUST revoke it.

#### Scenario: Valid staff credentials establish a session
- **WHEN** a staff member submits a valid email and password to `/admin/login` from the same origin
- **THEN** the system creates a session record storing only the SHA-256 hash of the session token, sets the `HttpOnly` session cookie, and redirects (`303`) to `/admin`

#### Scenario: Invalid credentials reject sign-in without creating a session
- **WHEN** a submission to `/admin/login` provides an unknown email or an incorrect password
- **THEN** the system responds with HTTP `401` and the message `"Email or password is incorrect."` without setting a session cookie

#### Scenario: Signing out revokes the session and clears the cookie
- **WHEN** a signed-in staff member submits a same-origin `POST` request to `/admin/logout`
- **THEN** the system marks the persisted session record as revoked, clears the session cookie, and redirects (`303`) to `/admin/login` so that any replayed copy of the cookie is rejected

### Requirement: Password secret stored exclusively as a hash
The stored secret for password authentication MUST be a cryptographic hash, and neither the database nor the published account skeleton contract note SHALL contain any plaintext password or live connection string.

#### Scenario: Database and contract note contain zero plaintext passwords
- **WHEN** a staff account is created or documented in the account skeleton contract note
- **THEN** the database stores only the bcrypt password hash (cost 12) and the contract note uses only a placeholder example (`ADMIN_PASSWORD='12+ chars'`) with zero real passwords or database credentials

### Requirement: Exposed account attributes restricted to email, name, and two-role enum
The account attributes available for display or authorization in current and future visual designs SHALL be restricted to the fields already stored on the staff account (`email`, `name`, and `role`), where `role` MUST be either `ADMIN` or `EDITOR`.

#### Scenario: Signed-in admin view reads existing staff attributes
- **WHEN** an authenticated staff member loads `/admin`
- **THEN** the system resolves `email`, `name`, and `role` (`ADMIN` or `EDITOR`) from the active session's staff record without querying a username, external provider subject, or secondary user table

#### Scenario: Invalid role is rejected during account creation
- **WHEN** the command-line account creation tool is invoked with a role other than `ADMIN` or `EDITOR`
- **THEN** the command refuses to write the account record and exits with code `1`

### Requirement: Public offer catalog and visitor lead flow remain unchanged
Publishing the staff account skeleton SHALL NOT alter the public offer allowlist or the visitor write path; the public catalog MUST expose only `leadership-advisory`, `group-coaching`, and `premium-coaching`, visitors MUST continue to submit inquiries as lead records, and `/programs/internship` MUST return HTTP `404`.

#### Scenario: Visitor submits a lead while public offers stay restricted to three programs
- **WHEN** an anonymous visitor browses public program routes or submits the contact form
- **THEN** `/programs/leadership-advisory`, `/programs/group-coaching`, and `/programs/premium-coaching` resolve, `/programs/internship` returns HTTP `404`, and contact submissions create a lead record rather than a user account
