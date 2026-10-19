# local-build-proof Specification

## Purpose

Defines the behavioral contract for proving the CK Coaching Group public site builds and passes its verification suites against isolated local Postgres databases while preserving the public offer allowlist, hub database separation, and secret-free verification evidence.

## Requirements

### Requirement: Production build reads seeded public content from DATABASE_URL
The production build SHALL complete with exit code `0` only when public pages can connect to `DATABASE_URL` and read the seeded programs, people, and offices during static prerendering.

#### Scenario: Build succeeds against migrated and seeded local database
- **WHEN** the production build runs after schema migrations and seed data have been applied to `DATABASE_URL` with valid credentials
- **THEN** public pages (including `/coach`, `/programs`, and `/locations`) prerender the seeded programs, people, and offices and the build exits with code `0`

#### Scenario: Build fails when DATABASE_URL rejects authentication or lacks schema
- **WHEN** the production build runs while `DATABASE_URL` rejects credentials or has not been migrated
- **THEN** prerendering fails when querying public content and the build exits with a non-zero code

### Requirement: Test database isolation for lead mutations
`DATABASE_URL` and `TEST_DATABASE_URL` MUST point to two distinct databases, and automated tests that mutate or truncate leads SHALL execute against `TEST_DATABASE_URL` only.

#### Scenario: Automated database tests run against separate test database
- **WHEN** the database test suite runs with `TEST_DATABASE_URL` pointing to `ccg_public_test` and `DATABASE_URL` pointing to `ccg_public`
- **THEN** test setup, lead insertions, and table truncations execute exclusively against `TEST_DATABASE_URL` without mutating `DATABASE_URL`

#### Scenario: Test suite refuses identical database URLs
- **WHEN** the database test suite is invoked with `TEST_DATABASE_URL` equal to `DATABASE_URL`
- **THEN** the test suite refuses to run and exits with an error before truncating or mutating any rows

### Requirement: Boot refusal when targeting the office hub database
The application process SHALL validate environment configuration at startup and MUST refuse to boot when `HUB_DATABASE_HOST` is set and the hostname of `DATABASE_URL` matches `HUB_DATABASE_HOST`.

#### Scenario: Startup refuses connection to HUB_DATABASE_HOST
- **WHEN** the application starts with `HUB_DATABASE_HOST` configured and `DATABASE_URL` pointing at that same hostname
- **THEN** startup validation rejects the configuration and terminates the process before listening for requests

#### Scenario: Startup succeeds when DATABASE_URL host differs from HUB_DATABASE_HOST
- **WHEN** the application starts with required environment variables (`DATABASE_URL`, `LEAD_TO_EMAIL`, and `LEAD_IP_SALT` of at least 16 characters) and `DATABASE_URL` does not match `HUB_DATABASE_HOST`
- **THEN** startup environment validation succeeds

### Requirement: Public offer catalog remains restricted to the three approved programs
The public catalog SHALL expose only `leadership-advisory`, `group-coaching`, and `premium-coaching`, and requests for withheld offers such as `/programs/internship` MUST return HTTP `404`.

#### Scenario: Approved program routes resolve
- **WHEN** a visitor requests `/programs/leadership-advisory`, `/programs/group-coaching`, or `/programs/premium-coaching`
- **THEN** the server responds with HTTP `200` and renders the corresponding seeded program details

#### Scenario: Withheld internship route returns 404
- **WHEN** a visitor requests `/programs/internship`
- **THEN** the publish gate rejects the slug without querying the database and the server responds with HTTP `404`

### Requirement: Secret-free build status evidence record
A build status record SHALL exist documenting every verification command executed, the execution date, the directory tree on which it ran, and its exit code, and MUST NOT contain any passwords or database connection strings.

#### Scenario: Status record captures verification evidence without secrets
- **WHEN** the local build and test verification workflow completes
- **THEN** the status document lists each command run, the date, the target tree, and the exit code (or "not run" with reason for end-to-end tests if browsers are absent), and contains zero passwords or connection URLs
