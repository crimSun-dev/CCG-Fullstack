-- 010_weekday_rooms: the rooms are booked Monday to Friday, like office days.
--
-- A new Black Box meeting or CK Hall request may not touch a Saturday or a Sunday in Asia/Jakarta:
-- every office day from its start to its end is a weekday. Bookings already stored are left as they
-- are. Idempotent: safe to run twice.

-- A span to book: end after start, not starting before the current minute, and on weekdays only.
CREATE OR REPLACE FUNCTION wall_private.hq_future_span(s timestamptz, e timestamptz) RETURNS void
LANGUAGE plpgsql STABLE AS $$
BEGIN
  PERFORM wall_private.hq_span(s, e);
  IF s < date_trunc('minute', now()) THEN
    PERFORM wall_private.fail(400, 'validation_failed', 'start must not be in the past');
  END IF;
  IF EXISTS (SELECT 1 FROM generate_series((s AT TIME ZONE 'Asia/Jakarta')::date,
                                           ((e - interval '1 microsecond') AT TIME ZONE 'Asia/Jakarta')::date,
                                           interval '1 day') AS d
              WHERE extract(isodow FROM d) > 5) THEN
    PERFORM wall_private.fail(400, 'validation_failed', 'Rooms are booked Monday to Friday');
  END IF;
END $$;
