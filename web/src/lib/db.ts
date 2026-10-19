import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// One client per process. Neon hosts use Neon's serverless driver as the adapter (TDD GAP-02);
// any other Postgres (local dev, CI) uses node-postgres. There is no second pool on top.
function createClient(url: string): PrismaClient {
  const host = new URL(url).hostname;
  const adapter = host.endsWith(".neon.tech")
    ? new PrismaNeon({ connectionString: url })
    : new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function db(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  globalForPrisma.prisma ??= createClient(url);
  return globalForPrisma.prisma;
}

export { createClient };
