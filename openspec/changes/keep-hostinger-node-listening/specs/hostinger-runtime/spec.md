## Purpose

Ensures the published standalone Next.js server resolves all runtime dependencies without broken virtual-store symlinks and validates required environment variables upon startup on Hostinger.

## ADDED Requirements

### Requirement: Published server resolves its own dependencies
The published standalone server MUST resolve its runtime modules from the published directory without depending on broken symlinks to an external virtual store.

#### Scenario: Install layout Hostinger copies
- **WHEN** Hostinger installs dependencies with pnpm 11 for the standalone build
- **THEN** `node_modules/next` is a real directory
- **AND** the standalone output does not point `next` at `node_modules/.pnpm`

#### Scenario: Moved publish directory
- **WHEN** the standalone output has been copied to an isolated directory and `node server.js` starts with runtime environment variables set
- **THEN** the process stays listening
- **AND** a request for `/` is served by the application

### Requirement: Missing runtime environment stays a startup failure
The server MUST refuse to listen when `DATABASE_URL`, `LEAD_TO_EMAIL`, or `LEAD_IP_SALT` is absent, and MUST write the validation error before exiting.

#### Scenario: Runtime process has no database URL
- **WHEN** the standalone server is started without `DATABASE_URL`
- **THEN** the process prints the environment validation error
- **AND** the process exits before accepting connections

### Requirement: Hostinger install linker
The build process MUST enforce a hoisted pnpm node linker and MUST NOT rely on `node-linker` in `.npmrc`.

#### Scenario: pnpm 11 install
- **WHEN** the build runs
- **THEN** dependencies are reinstalled with `--config.node-linker=hoisted`
- **AND** the build fails if `node_modules/next` remains a symlink
