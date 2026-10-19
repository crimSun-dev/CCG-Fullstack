import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { createContentRepository } from "@/lib/content-repository";
import { prisma } from "./client";

const repo = createContentRepository(prisma);

describe("seed", () => {
  it("loads exactly the three public programs, in deck order", async () => {
    const programs = await repo.listPublicPrograms();
    expect(programs.map((p) => p.code)).toEqual(["leadership-advisory", "group-coaching", "premium-coaching"]);
  });

  it("test_seed_has_deck_capacity_and_no_price_column", async () => {
    const group = await repo.getPublicProgram("group-coaching");
    const premium = await repo.getPublicProgram("premium-coaching");
    expect(group).toMatchObject({ capacity: 20, sessionsPerYear: 4, durationLabel: "1 year" });
    expect(premium).toMatchObject({ capacity: 4, sessionsPerYear: 8, formatLabel: "1:1 tailor made" });

    const columns = Object.keys(Prisma.ProgramScalarFieldEnum);
    expect(columns.some((c) => /price/i.test(c))).toBe(false);
  });

  it("test_seed_erry_role_is_null", async () => {
    const people = await repo.listPeople();
    const erry = people.find((p) => p.name === "Erry Sunarli");
    expect(erry).toBeDefined();
    expect(erry?.role).toBeNull();

    const founders = people.filter((p) => p.isFounder);
    expect(founders.map((p) => p.name)).toEqual(["CK Song"]);
  });

  it("test_seed_seoul_has_no_invented_street", async () => {
    const offices = await repo.listOffices();
    const seoul = offices.find((o) => o.city === "Seoul");
    const jakarta = offices.find((o) => o.city === "Jakarta");
    expect(seoul).toMatchObject({ kind: "BRANCH", address: null });
    expect(jakarta?.kind).toBe("HEAD");
    expect(jakarta?.address).toContain("Sudirman");
    expect(jakarta?.address).toContain("12190");
  });

  it("seeds the seven deck pressures and no eighth", async () => {
    const pressures = await repo.listPressures();
    expect(pressures).toHaveLength(7);
    expect(pressures[0]?.title).toBe("Global competition");
    expect(pressures[6]?.title).toBe("Globally diverse workforce");
  });

  it("does not expand the cut-off 'Miles' source name", async () => {
    const stats = await repo.listPublicStats();
    const stanford = stats.find((s) => s.sourceName.startsWith("Stanford"));
    expect(stanford?.sourceName).toBe("Stanford University and Miles, study of over 200 CEOs");
  });
});
