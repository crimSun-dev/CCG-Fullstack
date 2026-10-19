-- AlterTable
ALTER TABLE "admin_user" ADD COLUMN     "google_sub" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "admin_user_google_sub_key" ON "admin_user"("google_sub");
