-- 015_remove_stock_draven: the stock "Draven" name goes.
--
-- It was put on the hub before CCG sign-in (012) and has no CCG account, so no one can sign in as
-- it, yet it still showed on the names list and in who's in. A Draven who entered from CCG has a
-- ccg_sub and stays. Like 014, everything that names it goes: sessions, office days, follows either
-- way, invitations it holds or sent, and the meetings it booked. Its notes stay on the wall,
-- unsigned, because the words on them are the office's own. Idempotent: safe to run twice.

DO $$
DECLARE
  gone uuid[];
BEGIN
  SELECT coalesce(array_agg(id), '{}') INTO gone
    FROM people WHERE ccg_sub IS NULL AND lower(btrim(display_name)) = 'draven';
  IF cardinality(gone) = 0 THEN
    RETURN;
  END IF;

  DELETE FROM lab_sessions WHERE person_id = ANY (gone);
  DELETE FROM arrivals WHERE person_id = ANY (gone);
  -- 016 drops follows; run again after it, there are none to clear.
  IF to_regclass('follows') IS NOT NULL THEN
    DELETE FROM follows WHERE person_id = ANY (gone) OR follows_id = ANY (gone);
  END IF;
  DELETE FROM meeting_invites
   WHERE person_id = ANY (gone) OR invited_by = ANY (gone)
      OR booking_id IN (SELECT id FROM bookings WHERE created_by = ANY (gone));
  DELETE FROM bookings WHERE created_by = ANY (gone);
  UPDATE notes SET author_id = NULL WHERE author_id = ANY (gone);
  DELETE FROM people WHERE id = ANY (gone);
END $$;
