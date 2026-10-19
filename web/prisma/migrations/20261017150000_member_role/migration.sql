-- A general visitor is MEMBER. ADMIN and EDITOR stay staff roles granted by the CLI.
ALTER TABLE "admin_user" DROP CONSTRAINT "admin_user_role";
ALTER TABLE "admin_user" ADD CONSTRAINT "admin_user_role"
  CHECK ("role" IN ('ADMIN', 'EDITOR', 'MEMBER'));
