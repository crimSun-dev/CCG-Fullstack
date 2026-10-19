import "dotenv/config";
import { createClient } from "../src/lib/db";
import { hashPassword } from "../src/lib/session-service";

// Usage: pnpm admin:create <email> <name> <ADMIN|EDITOR>
// The password is read from ADMIN_PASSWORD so it never lands in shell history as an argument.
async function main() {
  const [email, name, role] = process.argv.slice(2);
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !name || (role !== "ADMIN" && role !== "EDITOR") || !password || password.length < 12) {
    console.error("Usage: ADMIN_PASSWORD=<12+ chars> pnpm admin:create <email> <name> <ADMIN|EDITOR>");
    process.exit(1);
  }
  const prisma = createClient(process.env.DATABASE_URL ?? "");
  const normalized = email.trim().toLowerCase();
  const passwordHash = await hashPassword(password);
  await prisma.adminUser.upsert({
    where: { email: normalized },
    create: { email: normalized, name, role, passwordHash },
    update: { name, role, passwordHash },
  });
  console.log(`Admin user ${normalized} (${role}) is ready.`);
  await prisma.$disconnect();
}

main();
