import { describe, expect, it } from "vitest";
import { prisma } from "./client";

describe("CHECK constraints", () => {
  it("test_migration_rejects_internship_insert", async () => {
    await expect(
      prisma.program.create({ data: { code: "internship", title: "Internship", summary: "x" } }),
    ).rejects.toThrow(/program_code_public|check constraint/i);
    expect(await prisma.program.count({ where: { code: "internship" } })).toBe(0);
  });

  it("test_editor_cannot_insert_program (database half: a direct insert still fails)", async () => {
    for (const code of ["camp", "university", "kenity", "Group-Coaching"]) {
      await expect(prisma.program.create({ data: { code, title: code, summary: "x" } })).rejects.toThrow();
    }
    expect(await prisma.program.count()).toBe(3);
  });

  it("lead.interest rejects internship and camp", async () => {
    for (const interest of ["internship", "camp"]) {
      await expect(
        prisma.lead.create({ data: { name: "n", email: "a@b", interest, consentAt: new Date() } }),
      ).rejects.toThrow(/lead_interest|check constraint/i);
    }
  });

  it("office.kind, lead.email_status, and admin_user.role are closed sets", async () => {
    await expect(prisma.office.create({ data: { city: "Bali", kind: "POPUP" } })).rejects.toThrow();
    await expect(
      prisma.lead.create({
        data: { name: "n", email: "a@b", interest: "general", consentAt: new Date(), emailStatus: "MAYBE" },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.adminUser.create({ data: { email: "x@y", name: "x", passwordHash: "h", role: "OWNER" } }),
    ).rejects.toThrow();
  });
});
