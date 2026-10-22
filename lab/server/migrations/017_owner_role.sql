-- CCG OWNER may enter the lab the same way ADMIN does (staff hand-off).
ALTER TABLE lab_sessions DROP CONSTRAINT IF EXISTS lab_sessions_role_check;
ALTER TABLE lab_sessions
  ADD CONSTRAINT lab_sessions_role_check CHECK (role IN ('OWNER', 'ADMIN', 'EDITOR', 'STAFF'));
