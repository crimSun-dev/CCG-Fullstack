import type { PrismaClient } from "@/generated/prisma/client";
import { assertPublicCode, PUBLIC_PROGRAM_CODES, type ProgramCode } from "./publish-gate";

export type Program = {
  code: ProgramCode;
  title: string;
  summary: string;
  durationLabel: string;
  sessionsPerYear: number | null;
  sessionLengthLabel: string | null;
  capacity: number | null;
  formatLabel: string | null;
};

export type Person = {
  id: string;
  name: string;
  role: string | null;
  bio: string;
  sortOrder: number;
  isFounder: boolean;
};

export type Office = {
  id: string;
  city: string;
  kind: "HEAD" | "BRANCH";
  address: string | null;
};

export type Stat = {
  id: string;
  valueText: string;
  statement: string;
  sourceName: string;
  sourceDate: string;
};

export type Pressure = { id: string; title: string; sortOrder: number };

export interface ContentRepository {
  listPublicPrograms(): Promise<Program[]>;
  getPublicProgram(code: ProgramCode): Promise<Program | null>;
  listPeople(): Promise<Person[]>;
  listOffices(): Promise<Office[]>;
  listPublicStats(): Promise<Stat[]>;
  listPressures(): Promise<Pressure[]>;
}

type ProgramRow = Omit<Program, "code"> & { code: string };

function toProgram(row: ProgramRow): Program {
  return { ...row, code: assertPublicCode(row.code) };
}

export function createContentRepository(prisma: PrismaClient): ContentRepository {
  return {
    async listPublicPrograms() {
      const rows = await prisma.program.findMany({
        where: { code: { in: [...PUBLIC_PROGRAM_CODES] } },
      });
      // Deck order, not alphabetical.
      return rows
        .map(toProgram)
        .sort((a, b) => PUBLIC_PROGRAM_CODES.indexOf(a.code) - PUBLIC_PROGRAM_CODES.indexOf(b.code));
    },

    async getPublicProgram(code) {
      const row = await prisma.program.findUnique({ where: { code: assertPublicCode(code) } });
      return row ? toProgram(row) : null;
    },

    listPeople() {
      return prisma.person.findMany({ orderBy: { sortOrder: "asc" } });
    },

    async listOffices() {
      const rows = await prisma.office.findMany({ orderBy: [{ kind: "desc" }, { city: "asc" }] });
      return rows.map((r) => ({ ...r, kind: r.kind as Office["kind"] }));
    },

    listPublicStats() {
      return prisma.stat.findMany({ orderBy: { sourceName: "asc" } });
    },

    listPressures() {
      return prisma.pressure.findMany({ orderBy: { sortOrder: "asc" } });
    },
  };
}
