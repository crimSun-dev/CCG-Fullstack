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

describe("role grants", () => {
  it("an ADMIN makes a member STAFF and clears it again, effective on the next request", async () => {
    const admin = await make("admin@test.ccg", "ADMIN");
    const member = await make("member@test.ccg", "MEMBER");
    const token = (
      await prisma.adminSession.create({
        data: { userId: member.id, tokenHash: "h", expiresAt: new Date(Date.now() + 60_000) },
      })
    ).tokenHash;

    expect(await roles.setRole(asUser(admin), member.id, "STAFF")).toEqual({
      ok: true,
      previous: "MEMBER",
      next: "STAFF",
    });
    expect((await prisma.adminUser.findUniqueOrThrow({ where: { id: member.id } })).role).toBe("STAFF");
    const read = await prisma.adminSession.findUniqueOrThrow({ where: { tokenHash: token }, include: { user: true } });
    expect(isStaffRole(read.user.role)).toBe(true);

    expect(await roles.setRole(asUser(admin), member.id, "MEMBER")).toEqual({
      ok: true,
      previous: "STAFF",
      next: "MEMBER",
    });
    expect((await prisma.adminUser.findUniqueOrThrow({ where: { id: member.id } })).role).toBe("MEMBER");
  });

  it("an ADMIN cannot grant ADMIN or touch another ADMIN", async () => {
    const admin = await make("admin@test.ccg", "ADMIN");
    const member = await make("member@test.ccg", "MEMBER");
    const other = await make("other-admin@test.ccg", "ADMIN");
    expect(await roles.setRole(asUser(admin), member.id, "ADMIN")).toMatchObject({ error: "forbidden" });
    expect(await roles.setRole(asUser(admin), other.id, "STAFF")).toMatchObject({ error: "fixed_role" });
    expect((await prisma.adminUser.findUniqueOrThrow({ where: { id: member.id } })).role).toBe("MEMBER");
  });

  it("an OWNER promotes to ADMIN (staff included) and can demote again", async () => {
    const owner = await make("draven.chen1st@gmail.com", "OWNER");
    const member = await make("member@test.ccg", "MEMBER");
    expect(await roles.setRole(asUser(owner), member.id, "ADMIN")).toEqual({
      ok: true,
      previous: "MEMBER",
      next: "ADMIN",
    });
    expect(isStaffRole("ADMIN")).toBe(true);
    expect(await roles.setRole(asUser(owner), member.id, "STAFF")).toEqual({
      ok: true,
      previous: "ADMIN",
      next: "STAFF",
    });
    expect(await roles.setRole(asUser(owner), member.id, "MEMBER")).toEqual({
      ok: true,
      previous: "STAFF",
      next: "MEMBER",
    });
  });

  it("nobody changes the owner mailbox, and actors cannot change themselves", async () => {
    const owner = await make("draven.chen1st@gmail.com", "OWNER");
    const admin = await make("admin@test.ccg", "ADMIN");
    expect(await roles.setRole(asUser(admin), owner.id, "STAFF")).toMatchObject({ error: "owner_protected" });
    expect(await roles.setRole(asUser(owner), owner.id, "ADMIN")).toMatchObject({ error: "self" });
    expect(await roles.setRole(asUser(admin), admin.id, "STAFF")).toMatchObject({ error: "self" });
    expect((await prisma.adminUser.findUniqueOrThrow({ where: { id: owner.id } })).role).toBe("OWNER");
  });

  it("refuses MEMBER, STAFF and EDITOR actors", async () => {
    const target = await make("target@test.ccg", "MEMBER");
    for (const role of ["MEMBER", "STAFF", "EDITOR"]) {
      const actor = await make(`${role.toLowerCase()}@test.ccg`, role);
      expect(await roles.setRole(asUser(actor), target.id, "STAFF")).toEqual({ ok: false, error: "forbidden" });
    }
  });

  it("never changes an EDITOR from this page", async () => {
    const owner = await make("draven.chen1st@gmail.com", "OWNER");
    const editor = await make("editor@test.ccg", "EDITOR");
    expect(await roles.setRole(asUser(owner), editor.id, "ADMIN")).toMatchObject({ error: "fixed_role" });
  });

  it("lists every account without password hashes", async () => {
    await make("a@test.ccg", "MEMBER");
    const list = await roles.list();
    expect(list).toHaveLength(1);
    expect(Object.keys(list[0]).sort()).toEqual(["email", "googleLinked", "id", "name", "role"]);
  });

  it("searches by name or email, case-insensitive", async () => {
    await prisma.adminUser.create({
      data: { email: "draven.chen1st@gmail.com", name: "Draven Chen", role: "OWNER", passwordHash: "x" },
    });
    await prisma.adminUser.create({
      data: { email: "other@test.ccg", name: "Other Person", role: "STAFF", passwordHash: "x" },
    });
    expect((await roles.list("DRAVEN")).map((a) => a.email)).toEqual(["draven.chen1st@gmail.com"]);
    expect((await roles.list("@gmail")).map((a) => a.email)).toEqual(["draven.chen1st@gmail.com"]);
    expect((await roles.list("other person")).map((a) => a.email)).toEqual(["other@test.ccg"]);
    expect(await roles.list("   ")).toHaveLength(2);
    expect(await roles.list("nobody-here")).toEqual([]);
  });

  it("lostLabAccess is true only when the next role is not staff-capable", () => {
    expect(roles.lostLabAccess("STAFF", "MEMBER")).toBe(true);
    expect(roles.lostLabAccess("ADMIN", "MEMBER")).toBe(true);
    expect(roles.lostLabAccess("ADMIN", "STAFF")).toBe(false);
    expect(roles.lostLabAccess("MEMBER", "STAFF")).toBe(false);
  });
});
