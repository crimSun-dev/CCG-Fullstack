-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "program" (
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "duration_label" TEXT NOT NULL DEFAULT '',
    "sessions_per_year" INTEGER,
    "session_length_label" TEXT,
    "capacity" INTEGER,
    "format_label" TEXT,

    CONSTRAINT "program_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "person" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "bio" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "is_founder" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "office" (
    "id" UUID NOT NULL,
    "city" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "address" TEXT,

    CONSTRAINT "office_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stat" (
    "id" UUID NOT NULL,
    "value_text" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "source_name" TEXT NOT NULL,
    "source_date" TEXT NOT NULL,

    CONSTRAINT "stat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pressure" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "pressure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "organization" TEXT,
    "interest" TEXT NOT NULL,
    "message" TEXT,
    "consent_at" TIMESTAMP(3) NOT NULL,
    "email_status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_attempt" (
    "id" UUID NOT NULL,
    "ip_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_user" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "admin_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_session" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "admin_session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_email_created_at_idx" ON "lead"("email", "created_at");

-- CreateIndex
CREATE INDEX "lead_attempt_ip_hash_created_at_idx" ON "lead_attempt"("ip_hash", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "admin_user_email_key" ON "admin_user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "admin_session_token_hash_key" ON "admin_session"("token_hash");

-- CreateIndex
CREATE INDEX "admin_session_user_id_idx" ON "admin_session"("user_id");

-- AddForeignKey
ALTER TABLE "admin_session" ADD CONSTRAINT "admin_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "admin_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- CHECK constraints (TDD Section 3). Prisma's schema cannot express these.
-- Changing the public catalog is this list plus PUBLIC_PROGRAM_CODES in src/lib/publish-gate.ts, in one commit.
ALTER TABLE "program" ADD CONSTRAINT "program_code_public"
  CHECK ("code" IN ('leadership-advisory', 'group-coaching', 'premium-coaching'));

ALTER TABLE "office" ADD CONSTRAINT "office_kind"
  CHECK ("kind" IN ('HEAD', 'BRANCH'));

ALTER TABLE "lead" ADD CONSTRAINT "lead_interest"
  CHECK ("interest" IN ('leadership-advisory', 'group-coaching', 'premium-coaching', 'general'));

ALTER TABLE "lead" ADD CONSTRAINT "lead_email_status"
  CHECK ("email_status" IN ('PENDING', 'SENT', 'FAILED'));

ALTER TABLE "admin_user" ADD CONSTRAINT "admin_user_role"
  CHECK ("role" IN ('ADMIN', 'EDITOR'));
