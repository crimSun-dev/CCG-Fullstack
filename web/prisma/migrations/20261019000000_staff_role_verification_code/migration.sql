-- STAFF reads enquiries and enters the lab. Only an ADMIN grants it, from /admin/users.
ALTER TABLE "admin_user" DROP CONSTRAINT "admin_user_role";
ALTER TABLE "admin_user" ADD CONSTRAINT "admin_user_role"
  CHECK ("role" IN ('ADMIN', 'EDITOR', 'STAFF', 'MEMBER'));

CREATE TABLE "verification_code" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "new_email" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_code_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "verification_code_user_id_purpose_idx" ON "verification_code"("user_id", "purpose");

ALTER TABLE "verification_code" ADD CONSTRAINT "verification_code_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "admin_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "verification_code" ADD CONSTRAINT "verification_code_purpose"
  CHECK ("purpose" IN ('PASSWORD_RESET', 'EMAIL_CHANGE'));
ALTER TABLE "verification_code" ADD CONSTRAINT "verification_code_new_email"
  CHECK (("purpose" = 'EMAIL_CHANGE') = ("new_email" IS NOT NULL));
