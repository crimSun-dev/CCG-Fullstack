-- 016_activity: no more follows; everyone hears everything the lab does.
--
-- The lab is for invited CCG staff only (012), so there is nothing to follow: every action anyone takes
-- is a line in everyone's notices. The activity table records them, written by triggers on the tables
-- the actions change, so no rule function has to remember to log and the office server and wall.* agree.
--
-- Who did it: hq_require (every hub write) puts the caller in wall.actor for the transaction. Note writes
-- from the office server set it themselves; a row's own person (booker, invitee, author, office-day
-- owner) is the fallback. An action with no known actor is still logged, as "someone".
--
-- What is logged: Black Box bookings and cancellations; CK Hall requests, confirmations, declines and
-- cancellations; invitations and their answers; office days (coming in, not coming, a changed time or
-- note, a plan taken back) and the trip in (on the way, arrived, undone); post-its stuck, edited and taken
-- down. Edits to one note by one person within 10 minutes are one line. Undoing a take-down removes its
-- line. Whiteboard ink carries no author and is not logged. Lines older than 30 days are pruned.
--
-- A person removed with their CCG account (014) takes their lines with them, and the lines that name them.
-- Idempotent: safe to run twice.

/* ------------------------------------------------------------ follows -- */

DROP FUNCTION IF EXISTS wall.follow(uuid, uuid, boolean);
DROP FUNCTION IF EXISTS wall_private.hq_follow(uuid, uuid, uuid, boolean);
DROP FUNCTION IF EXISTS wall_private.hq_follows(uuid);
DROP TABLE IF EXISTS follows;

/* ------------------------------------------------------------- tables -- */

CREATE TABLE IF NOT EXISTS activity (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id),
  at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind       TEXT NOT NULL,
  actor_id   UUID REFERENCES people(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES people(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
  note_id    UUID,
  detail     JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS activity_company_at ON activity (company_id, at DESC, id DESC);
CREATE INDEX IF NOT EXISTS activity_note ON activity (note_id) WHERE note_id IS NOT NULL;
ALTER TABLE activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON activity FROM authenticated, anonymous;

/* ------------------------------------------------------------ helpers -- */

-- The caller's name on this company, or 401. Also says who is acting, for the activity triggers.
CREATE OR REPLACE FUNCTION wall_private.hq_require(cid uuid, me uuid) RETURNS people
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog, public AS $$
DECLARE
  p people := wall_private.hq_person(cid, me);
BEGIN
  IF p.id IS NULL THEN PERFORM wall_private.fail(401, 'person_required', 'Pick or add your name first'); END IF;
  PERFORM set_config('wall.actor', p.id::text, true);
  RETURN p;
END $$;

-- Who is acting in this transaction, if anyone said.
CREATE OR REPLACE FUNCTION wall_private.hq_actor() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('wall.actor', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION wall_private.hq_log(cid uuid, a_kind text, actor uuid, subject uuid, b_id uuid, n_id uuid,
  a_detail jsonb) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  INSERT INTO activity (company_id, kind, actor_id, subject_id, booking_id, note_id, detail)
    VALUES (cid, a_kind, actor, subject, b_id, n_id, coalesce(a_detail, '{}'::jsonb));
  DELETE FROM activity WHERE company_id = cid AND at < now() - interval '30 days';
END $$;

CREATE OR REPLACE FUNCTION wall_private.hq_booking_brief(b bookings) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
  SELECT jsonb_build_object('room', b.room, 'title', b.title,
    'startAt', wall_private.iso(b.start_at), 'endAt', wall_private.iso(b.end_at))
$$;

/* ----------------------------------------------------------- triggers -- */

CREATE OR REPLACE FUNCTION wall_private.hq_log_booking() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM wall_private.hq_log(NEW.company_id, CASE NEW.room WHEN 'black_box' THEN 'meeting_booked' ELSE 'hall_requested' END,
      NEW.created_by, NULL, NEW.id, NULL, wall_private.hq_booking_brief(NEW));
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('cancelled', 'confirmed', 'declined') THEN
    PERFORM wall_private.hq_log(NEW.company_id,
      CASE NEW.status WHEN 'cancelled' THEN 'booking_cancelled' WHEN 'confirmed' THEN 'hall_confirmed' ELSE 'hall_declined' END,
      coalesce(wall_private.hq_actor(), CASE WHEN NEW.status = 'cancelled' THEN NEW.created_by END),
      NEW.created_by, NEW.id, NULL, wall_private.hq_booking_brief(NEW));
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION wall_private.hq_log_invite() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  b bookings;
  k text;
BEGIN
  IF TG_OP = 'INSERT' OR (NEW.status = 'invited' AND OLD.status IS DISTINCT FROM 'invited') THEN
    k := 'invited';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    k := NEW.status;   -- accepted | declined
  ELSE
    RETURN NULL;
  END IF;
  SELECT * INTO b FROM bookings WHERE id = NEW.booking_id;
  PERFORM wall_private.hq_log(b.company_id, k,
    CASE k WHEN 'invited' THEN NEW.invited_by ELSE NEW.person_id END,
    NEW.person_id, b.id, NULL, wall_private.hq_booking_brief(b));
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION wall_private.hq_log_arrival() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  d jsonb;
  started boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM wall_private.hq_log(OLD.company_id, 'plan_cleared', OLD.person_id, NULL, NULL, NULL,
      jsonb_build_object('day', to_char(OLD.day, 'YYYY-MM-DD')));
    RETURN NULL;
  END IF;
  d := jsonb_build_object('day', to_char(NEW.day, 'YYYY-MM-DD'), 'arriveAt', to_char(NEW.arrive_at, 'HH24:MI'), 'note', NEW.note);
  started := NEW.left_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.left_at IS NULL);
  -- Setting off says "coming in" too; the trip line alone says it.
  IF (TG_OP = 'INSERT' OR NEW.coming IS DISTINCT FROM OLD.coming) AND NOT started THEN
    PERFORM wall_private.hq_log(NEW.company_id, CASE WHEN NEW.coming THEN 'coming_in' ELSE 'not_coming' END,
      NEW.person_id, NULL, NULL, NULL, d);
  ELSIF TG_OP = 'UPDATE' AND (NEW.arrive_at IS DISTINCT FROM OLD.arrive_at OR NEW.note IS DISTINCT FROM OLD.note) THEN
    PERFORM wall_private.hq_log(NEW.company_id, CASE WHEN NEW.coming THEN 'coming_in' ELSE 'not_coming' END,
      NEW.person_id, NULL, NULL, NULL, d || jsonb_build_object('changed', true));
  END IF;
  IF started THEN
    PERFORM wall_private.hq_log(NEW.company_id, 'on_the_way', NEW.person_id, NULL, NULL, NULL, d);
  END IF;
  IF NEW.arrived_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.arrived_at IS NULL) THEN
    PERFORM wall_private.hq_log(NEW.company_id, 'arrived', NEW.person_id, NULL, NULL, NULL, d);
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.coming AND OLD.left_at IS NOT NULL AND NEW.left_at IS NULL THEN
    PERFORM wall_private.hq_log(NEW.company_id, 'trip_reset', NEW.person_id, NULL, NULL, NULL, d);
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION wall_private.hq_log_note() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  d jsonb := jsonb_build_object('body', left(NEW.body, 140), 'color', NEW.color);
  who uuid;
  last activity;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.deleted_at IS NULL THEN
      PERFORM wall_private.hq_log(NEW.company_id, 'note_added', coalesce(NEW.author_id, wall_private.hq_actor()), NULL, NULL, NEW.id, d);
    END IF;
    RETURN NULL;
  END IF;
  who := wall_private.hq_actor();
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    PERFORM wall_private.hq_log(NEW.company_id, 'note_removed', who, NULL, NULL, NEW.id, d);
  ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    -- Undo: the take-down never happened.
    DELETE FROM activity WHERE id = (SELECT id FROM activity WHERE note_id = NEW.id AND kind = 'note_removed' ORDER BY at DESC, id DESC LIMIT 1);
  ELSIF NEW.deleted_at IS NULL AND (NEW.body IS DISTINCT FROM OLD.body OR NEW.color IS DISTINCT FROM OLD.color) THEN
    SELECT * INTO last FROM activity WHERE note_id = NEW.id ORDER BY at DESC, id DESC LIMIT 1;
    IF last.id IS NOT NULL AND last.kind IN ('note_added', 'note_edited') AND last.at > now() - interval '10 minutes'
       AND last.actor_id IS NOT DISTINCT FROM coalesce(who, last.actor_id) THEN
      UPDATE activity SET detail = d || jsonb_build_object('edited', true) WHERE id = last.id;
    ELSE
      PERFORM wall_private.hq_log(NEW.company_id, 'note_edited', who, NULL, NULL, NEW.id, d);
    END IF;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS activity_bookings ON bookings;
CREATE TRIGGER activity_bookings AFTER INSERT OR UPDATE OF status ON bookings
  FOR EACH ROW EXECUTE FUNCTION wall_private.hq_log_booking();
DROP TRIGGER IF EXISTS activity_invites ON meeting_invites;
CREATE TRIGGER activity_invites AFTER INSERT OR UPDATE OF status ON meeting_invites
  FOR EACH ROW EXECUTE FUNCTION wall_private.hq_log_invite();
DROP TRIGGER IF EXISTS activity_arrivals ON arrivals;
CREATE TRIGGER activity_arrivals AFTER INSERT OR UPDATE OR DELETE ON arrivals
  FOR EACH ROW EXECUTE FUNCTION wall_private.hq_log_arrival();
DROP TRIGGER IF EXISTS activity_notes ON notes;
CREATE TRIGGER activity_notes AFTER INSERT OR UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION wall_private.hq_log_note();

/* --------------------------------------------------------- the reads -- */

-- The last 7 days, newest first, at most 150 lines. Names are read now, so a renamed person reads right.
CREATE OR REPLACE FUNCTION wall_private.hq_activity(cid uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
  SELECT coalesce(jsonb_agg(x.j ORDER BY x.at DESC, x.id DESC), '[]'::jsonb) FROM (
    SELECT a.at, a.id, jsonb_build_object('id', a.id, 'at', wall_private.iso(a.at), 'kind', a.kind,
      'actorId', a.actor_id, 'actorName', pa.display_name,
      'subjectId', a.subject_id, 'subjectName', ps.display_name,
      'bookingId', a.booking_id, 'noteId', a.note_id, 'detail', a.detail) AS j
      FROM activity a
      LEFT JOIN people pa ON pa.id = a.actor_id
      LEFT JOIN people ps ON ps.id = a.subject_id
     WHERE a.company_id = cid AND a.at > now() - interval '7 days'
     ORDER BY a.at DESC, a.id DESC
     LIMIT 150) x
$$;

-- The corridor snapshot (009), with the activity in place of follows.
CREATE OR REPLACE FUNCTION wall_private.hq_rooms(cid uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public AS $$
DECLARE
  d date := wall_private.hq_today();
  day_from timestamptz := d::timestamp AT TIME ZONE 'Asia/Jakarta';
  reach timestamptz := (d + 14)::timestamp AT TIME ZONE 'Asia/Jakarta';
  list jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(wall_private.hq_booking_json(b) ORDER BY b.start_at, b.id), '[]'::jsonb) INTO list
    FROM bookings b
   WHERE b.company_id = cid AND b.status IN ('active', 'requested', 'confirmed') AND b.end_at > day_from
     AND (b.start_at < reach OR (b.end_at > now() AND EXISTS (SELECT 1 FROM meeting_invites i WHERE i.booking_id = b.id)));
  RETURN jsonb_build_object('now', wall_private.iso(now()), 'day', to_char(d, 'YYYY-MM-DD'), 'days', 14,
    'people', wall_private.hq_people(cid),
    'bookings', list,
    'arrivals', wall_private.hq_list_arrivals(cid),
    'plans', wall_private.hq_list_plans(cid),
    'activity', wall_private.hq_activity(cid));
END $$;

/* ------------------------------------------------- removal (014, 015) -- */

-- 014 without follows. The person's lines go with their name (ON DELETE CASCADE); lines about their
-- notes go with the notes.
CREATE OR REPLACE FUNCTION wall_private.hq_remove_ccg(cid uuid, c_sub uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  pid uuid;
  note_ids uuid[];
BEGIN
  IF c_sub IS NULL THEN
    PERFORM wall_private.fail(400, 'validation_failed', 'sub is required');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ccg:' || cid::text || ':' || c_sub::text));

  SELECT id INTO pid FROM people WHERE company_id = cid AND ccg_sub = c_sub FOR UPDATE;
  IF pid IS NULL THEN
    RETURN NULL;
  END IF;

  DELETE FROM lab_sessions WHERE person_id = pid;
  DELETE FROM arrivals WHERE person_id = pid;
  DELETE FROM meeting_invites
   WHERE person_id = pid OR invited_by = pid
      OR booking_id IN (SELECT id FROM bookings WHERE created_by = pid);
  DELETE FROM bookings WHERE created_by = pid;
  WITH gone AS (DELETE FROM notes WHERE author_id = pid RETURNING id)
  SELECT coalesce(array_agg(id), '{}') INTO note_ids FROM gone;
  DELETE FROM activity WHERE note_id = ANY (note_ids);
  DELETE FROM people WHERE id = pid;

  RETURN jsonb_build_object('personId', pid, 'noteIds', to_jsonb(note_ids));
END $$;

/* ------------------------------------------------- Data API wrappers -- */

CREATE OR REPLACE FUNCTION wall.hub_activity() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  RETURN wall_private.hq_activity(wall_private.company());
END $$;

/* ------------------------------------------------------------- grants -- */
-- 012 closed wall.* to the Data API roles; nothing here reopens it.

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA wall, wall_private FROM PUBLIC;
