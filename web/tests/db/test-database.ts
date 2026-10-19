import "dotenv/config";

// DB tests run against TEST_DATABASE_URL only. They truncate lead tables, so they must never
// reach the app database.
export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL is not set. DB tests need a throwaway Postgres database (see .env.example).");
  }
  // setup-env.ts points DATABASE_URL at the test database for the code under test; the original
  // value is kept in CCG_APP_DATABASE_URL so this check still means something afterwards.
  const appUrl = process.env.CCG_APP_DATABASE_URL ?? process.env.DATABASE_URL;
  if (appUrl && url === appUrl) {
    throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL.");
  }
  return url;
}
