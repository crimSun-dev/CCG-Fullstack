import { testDatabaseUrl } from "./test-database";

const url = testDatabaseUrl();
process.env.CCG_APP_DATABASE_URL ??= process.env.DATABASE_URL ?? "";
process.env.DATABASE_URL = url;
