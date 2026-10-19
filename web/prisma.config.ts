import "dotenv/config";
import { defineConfig } from "prisma/config";

// `prisma generate` runs without a database, so the URL is read lazily here
// rather than through env(), which throws when the variable is missing.
// Neon’s pooled host (`-pooler`) is PgBouncer. Migrate’s session advisory lock
// never completes through it and times out with P1002. The app keeps DATABASE_URL.
function migrationUrl(url: string): string {
  return url.replace("-pooler.", ".");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: migrationUrl(process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? ""),
  },
});
