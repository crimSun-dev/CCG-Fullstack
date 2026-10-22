import "dotenv/config";
import { createClient } from "../src/lib/db";

type Db = ReturnType<typeof createClient>;

// Seed from CK COACHING_2026.pptx. No prices, no internship, no camp, no university.
// Erry Sunarli's role stays null until one title is confirmed (slide 29 vs the card mock).

const programs = [
  {
    code: "leadership-advisory",
    title: "Leadership Advisory Program",
    summary: "Advisory for leaders and business owners on their most critical business challenges.",
    durationLabel: "",
    sessionsPerYear: null,
    sessionLengthLabel: null,
    capacity: null,
    formatLabel: null,
  },
  {
    code: "group-coaching",
    title: "Group Coaching",
    summary: "A one-year CEO coaching program for a group of up to 20 leaders, one full day every three months.",
    durationLabel: "1 year",
    sessionsPerYear: 4,
    sessionLengthLabel: "1 day, every 3 months",
    capacity: 20,
    formatLabel: "cohort",
  },
  {
    code: "premium-coaching",
    title: "Premium Coaching",
    summary: "A one-year, 1:1 tailor-made CEO coaching program of eight full-day sessions.",
    durationLabel: "1 year",
    sessionsPerYear: 8,
    sessionLengthLabel: "1 day",
    capacity: 4,
    formatLabel: "1:1 tailor made",
  },
];

const people = [
  {
    name: "CK Song",
    role: "CCG Founder",
    bio: "CK Coaching Group (CCG) was founded to provide coaching and counseling that many leaders and organizations need to tackle their business challenges and capture great opportunities.",
    sortOrder: 0,
    isFounder: true,
  },
  { name: "Erry Sunarli", role: null, bio: "", sortOrder: 1, isFounder: false },
  { name: "Sandi Benedicta", role: "Creation Director", bio: "", sortOrder: 2, isFounder: false },
  { name: "JS OH", role: "GM Korea", bio: "", sortOrder: 3, isFounder: false },
];

const offices = [
  {
    city: "Jakarta",
    kind: "HEAD",
    address:
      "The Prominence, Alam Sutera Marketing Office, Jl. Jalur Sutera Boulevard Kav. 28A, RT.002/RW.003, Panunggangan Tim., Kec. Pinang, Tangerang 15143, Floor 21A",
  },
  { city: "Seoul", kind: "BRANCH", address: null },
];

const stats = [
  {
    valueText: "63%",
    statement:
      "63% of Asia Pacific CEOs believed their companies would no longer be viable in ten years if they continue on their current path.",
    sourceName: "PwC, 27th Annual Global CEO Survey, Asia Pacific",
    sourceDate: "January 2024",
  },
  {
    valueText: "30%",
    statement: "Only 30% of CEOs use a coach.",
    sourceName: "Stanford University and Miles, study of over 200 CEOs",
    sourceDate: "",
  },
];

const pressures = [
  "Global competition",
  "The fast pace of changing",
  "Changing customer demands",
  "Flatter organizations",
  "Competition for good talent",
  "Technological advancements",
  "Globally diverse workforce",
].map((title, sortOrder) => ({ title, sortOrder }));

export async function seedDatabase(prisma: Db) {
  await prisma.$transaction(async (tx) => {
    for (const p of programs) {
      await tx.program.upsert({ where: { code: p.code }, create: p, update: p });
    }
    await tx.person.deleteMany();
    await tx.person.createMany({ data: people });
    await tx.office.deleteMany();
    await tx.office.createMany({ data: offices });
    await tx.stat.deleteMany();
    await tx.stat.createMany({ data: stats });
    await tx.pressure.deleteMany();
    await tx.pressure.createMany({ data: pressures });
  });
  console.log(
    `Seeded ${programs.length} programs, ${people.length} people, ${offices.length} offices, ${stats.length} stats, ${pressures.length} pressures.`,
  );
}

const invokedDirectly = process.argv[1]?.replaceAll("\\", "/").endsWith("prisma/seed.ts");

if (invokedDirectly) {
  const prisma = createClient(process.env.DATABASE_URL ?? "");
  seedDatabase(prisma)
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
