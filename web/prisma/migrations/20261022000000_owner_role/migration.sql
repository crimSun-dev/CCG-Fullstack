-- OWNER is the site owner (draven.chen1st@gmail.com). Only OWNER promotes ADMIN.
-- ADMIN still grants and clears STAFF, and never touches OWNER or another ADMIN.

ALTER TABLE "admin_user" DROP CONSTRAINT IF EXISTS "admin_user_role_check";
ALTER TABLE "admin_user" DROP CONSTRAINT IF EXISTS "admin_user_role";
ALTER TABLE "admin_user"
  ADD CONSTRAINT "admin_user_role"
  CHECK ("role" IN ('OWNER', 'ADMIN', 'EDITOR', 'STAFF', 'MEMBER'));

UPDATE "admin_user"
SET "role" = 'OWNER'
WHERE lower("email") = 'draven.chen1st@gmail.com'
  AND "role" <> 'OWNER';
