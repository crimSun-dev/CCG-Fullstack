import { createClient } from "../../src/lib/db";
import { testDatabaseUrl } from "../db/test-database";

export const EDITOR = { email: "e2e-editor@test.ccg", password: "e2e editor password long", name: "E2E Editor" };

export const prisma = createClient(testDatabaseUrl());

// Every lead post carries its own forwarded IP so the per-IP rate limit is under the test's control.
let n = 0;
export const freshIp = () => `192.0.2.${(Date.now() % 200) + ++n}`;
