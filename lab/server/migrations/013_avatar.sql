-- 013_avatar: a CCG account's profile picture, shown on the "You" chip and on the notes it sticks.
--
-- The picture itself stays on the CCG site. Its signed hand-off carries the picture's URL (versioned,
-- so a new picture is a new URL); POST /v1/ccg/enter stores it here on every entry, and null clears it.
-- Names without a CCG account never have one. Idempotent: safe to run twice.

ALTER TABLE people ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE people DROP CONSTRAINT IF EXISTS people_avatar_url_check;
ALTER TABLE people ADD CONSTRAINT people_avatar_url_check
  CHECK (avatar_url IS NULL OR (avatar_url ~ '^https?://[^\s"''<>]+$' AND char_length(avatar_url) <= 512 AND ccg_sub IS NOT NULL));

CREATE OR REPLACE FUNCTION wall_private.hq_person_json(p people) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p.id IS NULL THEN NULL
    ELSE jsonb_build_object('id', p.id, 'displayName', p.display_name, 'role', p.role, 'avatarUrl', p.avatar_url) END
$$;
