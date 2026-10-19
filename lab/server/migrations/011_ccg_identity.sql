-- 011_ccg_identity: a CCG staff account, proven by the CCG site's signed hand-off, owns one hub name.
--
-- The CCG site never touches this database. It signs { sub, email, name, role, jti } with a shared
-- secret; POST /v1/ccg/enter checks the signature and calls hq_claim_ccg. A guest name with no owner
-- and the same spelling is adopted, so its notes and bookings stay with the person. A name already
-- owned by another CCG account is never taken: the newcomer gets "Name 2". One CCG account owns at
-- most one name, and one email sits on at most one name. Emails are never in hq_person_json.
-- Idempotent: safe to run twice.

ALTER TABLE people ADD COLUMN IF NOT EXISTS ccg_sub UUID;
ALTER TABLE people ADD COLUMN IF NOT EXISTS ccg_email TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS people_ccg_sub ON people (company_id, ccg_sub) WHERE ccg_sub IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS people_ccg_email ON people (company_id, lower(ccg_email)) WHERE ccg_email IS NOT NULL;
ALTER TABLE people DROP CONSTRAINT IF EXISTS people_ccg_pair;
-- An email only ever sits on a name a CCG account owns. (The email may be cleared; see below.)
ALTER TABLE people ADD CONSTRAINT people_ccg_pair CHECK (ccg_email IS NULL OR ccg_sub IS NOT NULL);

-- Each hand-off works once. Rows older than a day are pruned on the next entry; tokens live 60 seconds.
CREATE TABLE IF NOT EXISTS ccg_assertions_used (
  jti     UUID PRIMARY KEY,
  used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE ccg_assertions_used ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ccg_assertions_used FROM authenticated, anonymous;

-- The name a verified CCG account uses. Never exposed through the Data API (wall schema): only the
-- office server calls it, after checking the signature.
CREATE OR REPLACE FUNCTION wall_private.hq_claim_ccg(cid uuid, c_sub uuid, c_email text, c_name text) RETURNS jsonb
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  n text := left(btrim(regexp_replace(coalesce(c_name, ''), '\s+', ' ', 'g')), 60);
  e text := lower(btrim(coalesce(c_email, '')));
  rec people;
  candidate text;
  i integer := 1;
BEGIN
  IF c_sub IS NULL OR n = '' OR e = '' THEN
    PERFORM wall_private.fail(400, 'validation_failed', 'sub, email and name are required');
  END IF;
  -- One claim per account at a time, so two tabs cannot each create a name.
  PERFORM pg_advisory_xact_lock(hashtext('ccg:' || cid::text || ':' || c_sub::text));
  -- CCG's email is unique when signed. A stale copy on another account's name (it changed email) gives way.
  UPDATE people SET ccg_email = NULL
   WHERE company_id = cid AND lower(ccg_email) = e AND ccg_sub IS DISTINCT FROM c_sub;

  SELECT * INTO rec FROM people WHERE company_id = cid AND ccg_sub = c_sub FOR UPDATE;
  IF rec.id IS NOT NULL THEN
    UPDATE people SET ccg_email = e WHERE id = rec.id RETURNING * INTO rec;
    -- Follow a renamed CCG account when the new spelling is free; otherwise keep the name it has.
    IF rec.display_name <> n THEN
      BEGIN
        UPDATE people SET display_name = n WHERE id = rec.id RETURNING * INTO rec;
      EXCEPTION WHEN unique_violation THEN NULL;
      END;
    END IF;
    RETURN wall_private.hq_person_json(rec);
  END IF;

  SELECT * INTO rec FROM people
   WHERE company_id = cid AND lower(display_name) = lower(n) AND ccg_sub IS NULL FOR UPDATE;
  IF rec.id IS NOT NULL THEN
    UPDATE people SET ccg_sub = c_sub, ccg_email = e WHERE id = rec.id RETURNING * INTO rec;
    RETURN wall_private.hq_person_json(rec);
  END IF;

  candidate := n;
  LOOP
    BEGIN
      INSERT INTO people (company_id, display_name, role, ccg_sub, ccg_email)
        VALUES (cid, candidate, 'guest', c_sub, e) RETURNING * INTO rec;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      i := i + 1;
      IF i > 50 THEN PERFORM wall_private.fail(409, 'name_conflict', 'No free spelling of this name'); END IF;
      candidate := left(n, 60 - char_length(' ' || i)) || ' ' || i;
    END;
  END LOOP;
  RETURN wall_private.hq_person_json(rec);
END $$;

REVOKE ALL ON FUNCTION wall_private.hq_claim_ccg(uuid, uuid, text, text) FROM PUBLIC;
