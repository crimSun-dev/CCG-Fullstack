import { afterAll } from "vitest";
import { createClient } from "@/lib/db";
import { testDatabaseUrl } from "./test-database";

export const prisma = createClient(testDatabaseUrl());

afterAll(async () => {
  await prisma.$disconnect();
});
