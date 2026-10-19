import { beforeEach, describe, expect, it } from "vitest";
import { createStaffRoles } from "@/lib/staff-roles";
import { isStaffRole, type AdminUser } from "@/lib/session-service";
import { prisma } from "./client";

const roles = createStaffRoles(prisma);
const make = (email: string, role: string) => prisma.adminUser.create({ data: { email, name: email, role, passwordHash: "x" } });
const asUser = (u: { id: string; email: string; name: string; role: string }) => u as AdminUser;

beforeEach(async () => {
  await prisma.verificationCode.deleteMany();
  await prisma.adminSession.deleteMany();
  await prisma.adminUser.deleteMany();
});

describe("STAFF grant", () => {
  it("an ADMIN makes a member STAFF and clears it again, effective on the next request", async () => {
    const admin = await make("admin@test.ccg", "ADMIN");
    const member = await make("member@test.ccg", "MEMBER");
    const token = (await prisma.adminSession.create({
      data: { userId: member.id, tokenHash: "h", expiresAt: new Date(Date.now() + 60_000) },
    })).tokenHash;

    expect(await roles.setStaff(asUser(admin), member.id, true)).toEqual({ ok: true });
    expect((await prisma.adminUser.findUniqueOrThrow({ where: { id: member.id } })).role).toBe("STAFF");
    // The live session sees the new role without signing in again.
    const read = await prisma.adminSession.findUniqueOrThrow({ where: { tokenHash: token }, include: { user: true } });
    expect(isStaffRole(read.user.role)).toBe(true);

    expect(await roles.setStaff(asUser(admin), member.id, false)).toEqual({ ok: true });
    expect((await prisma.adminUser.findUniqueOrThrow({ where: { id: member.id } })).role).toBe("MEMBER");
  });

  it("refuses MEMBER, STAFF and EDITOR actors", async () => {
    const target = await make("target@test.ccg", "MEMBER");
    for (const role of ["MEMBER", "STAFF", "EDITOR"]) {
      const actor = await make(`${role.toLowerCase()}@test.ccg`, role);
      expect(await roles.setStaff(asUser(actor), target.id, true)).toEqual({ ok: false, error: "forbidden" });
    }
    expect((await prisma.adminUser.findUniqueOrThrow({ where: { id: target.id } })).role).toBe("MEMBER");
  });

  it("never changes the actor itself, another ADMIN, or an EDITOR", async () => {
    const admin = await make("admin@test.ccg", "ADMIN");
    const other = await make("other-admin@test.ccg", "ADMIN");
    const editor = await make("editor@test.ccg", "EDITOR");
    expect(await roles.setStaff(asUser(admin), admin.id, false)).toMatchObject({ error: "self" });
    expect(await roles.setStaff(asUser(admin), other.id, true)).toMatchObject({ error: "fixed_role" });
    expect(await roles.setStaff(asUser(admin), editor.id, true)).toMatchObject({ error: "fixed_role" });
    expect((await prisma.adminUser.findMany({ orderBy: { email: "asc" } })).map((u) => u.role)).toEqual(["ADMIN", "EDITOR", "ADMIN"]);
  });

  it("lists every account without password hashes", async () => {
    await make("a@test.ccg", "MEMBER");
    const list = await roles.list();
    expect(list).toHaveLength(1);
    expect(Object.keys(list[0]).sort()).toEqual(["email", "googleLinked", "id", "name", "role"]);
  });
});
