-- CreateTable
CREATE TABLE "account_avatar" (
    "user_id" UUID NOT NULL,
    "image" BYTEA NOT NULL,
    "content_type" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_avatar_pkey" PRIMARY KEY ("user_id")
);

-- AddForeignKey
ALTER TABLE "account_avatar" ADD CONSTRAINT "account_avatar_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "admin_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Only the three formats the site serves back, and never more than the 256 KB cap in src/lib/avatar.ts.
ALTER TABLE "account_avatar" ADD CONSTRAINT "account_avatar_type_check"
  CHECK ("content_type" IN ('image/jpeg', 'image/png', 'image/webp'));
ALTER TABLE "account_avatar" ADD CONSTRAINT "account_avatar_size_check"
  CHECK (octet_length("image") BETWEEN 1 AND 262144);
