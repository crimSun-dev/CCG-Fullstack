import { execSync } from "node:child_process";
import { hashPassword } from "../../src/lib/session-service";
import { testDatabaseUrl } from "../db/test-database";
import { EDITOR, prisma } from "./fixtures";

export default async function setup() {
  const env = { ...process.env, DATABASE_URL: testDatabaseUrl() };
  execSync("npx prisma migrate deploy", { stdio: "inherit", env });
  execSync("npx prisma db seed", { stdio: "inherit", env });

  await prisma.leadAttempt.deleteMany();
  await prisma.lead.deleteMany();
  const passwordHash = await hashPassword(EDITOR.password);
  await prisma.adminUser.upsert({
    where: { email: EDITOR.email },
    create: { email: EDITOR.email, name: EDITOR.name, role: "EDITOR", passwordHash },
    update: { passwordHash, role: "EDITOR" },
  });
  await prisma.$disconnect();
}
