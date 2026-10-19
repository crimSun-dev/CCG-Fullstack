-- 012_staff_only: the lab is for CCG staff who signed in, and no one else.
--
-- A lab session is born only from an accepted CCG hand-off (POST /v1/ccg/enter). The browser holds the
-- raw token in an HttpOnly cookie; this table holds its SHA-256. Every page, /v1 call and /v1/live
-- socket needs a live row, and the acting person is the row's person, never a name the page sends.
--
-- The GitHub Pages wall called wall.* through Neon's Data API as `anonymous` (005) or `authenticated`
-- (003): anyone could read and write. Both roles lose the schema here. The office server never used
-- wall.*; it calls wall_private.hq_* and plain SQL as the owner.
--
-- Former guest names stay (they author old notes and bookings) but can no longer be chosen.
-- Idempotent: safe to run twice.

CREATE TABLE IF NOT EXISTS lab_sessions (
  token_hash TEXT PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id),
  person_id  UUID NOT NULL REFERENCES people(id),
  role       TEXT NOT NULL CONSTRAINT lab_sessions_role_check CHECK (role IN ('ADMIN', 'EDITOR', 'STAFF')),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lab_sessions_person ON lab_sessions (person_id);
ALTER TABLE lab_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON lab_sessions FROM authenticated, anonymous;

-- Close the public Data API door.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA wall FROM PUBLIC, authenticated, anonymous;
REVOKE USAGE ON SCHEMA wall FROM PUBLIC, authenticated, anonymous;
ALTER DEFAULT PRIVILEGES IN SCHEMA wall REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
