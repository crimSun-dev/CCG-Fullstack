import "dotenv/config";
import { createClient } from "../src/lib/db";
import { seedDatabase } from "../prisma/seed";

// First Hostinger build finds an empty Neon database. Later builds keep admin edits.
const prisma = createClient(process.env.DATABASE_URL ?? "");

try {
  const count = await prisma.program.count();
  if (count > 0) {
    console.log(`Database already has ${count} programs; skipping seed.`);
  } else {
    await seedDatabase(prisma);
  }
} finally {
  await prisma.$disconnect();
}
