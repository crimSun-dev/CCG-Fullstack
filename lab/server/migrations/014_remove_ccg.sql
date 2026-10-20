-- 014_remove_ccg: a CCG account that loses staff leaves the lab with nothing behind.
--
-- The CCG site signs a removal notice for the account's sub; POST /v1/ccg/remove checks it and calls
-- hq_remove_ccg. Everything that names the person goes in one transaction: sessions, office days,
-- follows either way, invitations they hold or sent, the meetings they booked (with those meetings'
-- invitations), their notes, and the name itself. Whiteboard strokes carry no author and stay.
-- Idempotent: safe to run twice.

CREATE OR REPLACE FUNCTION wall_private.hq_remove_ccg(cid uuid, c_sub uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  pid uuid;
  note_ids uuid[];
BEGIN
  IF c_sub IS NULL THEN
    PERFORM wall_private.fail(400, 'validation_failed', 'sub is required');
  END IF;
  -- The same lock hq_claim_ccg takes, so a hand-off in flight cannot recreate the name halfway through.
  PERFORM pg_advisory_xact_lock(hashtext('ccg:' || cid::text || ':' || c_sub::text));

  SELECT id INTO pid FROM people WHERE company_id = cid AND ccg_sub = c_sub FOR UPDATE;
  IF pid IS NULL THEN
    RETURN NULL;   -- never entered the lab, or already removed
  END IF;

  DELETE FROM lab_sessions WHERE person_id = pid;
  DELETE FROM arrivals WHERE person_id = pid;
  DELETE FROM follows WHERE person_id = pid OR follows_id = pid;
  DELETE FROM meeting_invites
   WHERE person_id = pid OR invited_by = pid
      OR booking_id IN (SELECT id FROM bookings WHERE created_by = pid);
  DELETE FROM bookings WHERE created_by = pid;
  WITH gone AS (DELETE FROM notes WHERE author_id = pid RETURNING id)
  SELECT coalesce(array_agg(id), '{}') INTO note_ids FROM gone;
  DELETE FROM people WHERE id = pid;

  RETURN jsonb_build_object('personId', pid, 'noteIds', to_jsonb(note_ids));
END $$;

REVOKE ALL ON FUNCTION wall_private.hq_remove_ccg(uuid, uuid) FROM PUBLIC;
