import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it } from "vitest";
import { createSessionService, hashPassword, homeForRole } from "@/lib/session-service";
import { prisma } from "./client";

const sessions = createSessionService(prisma);
const PASSWORD = "a long enough password";

beforeEach(async () => {
  await prisma.verificationCode.deleteMany();
  await prisma.adminSession.deleteMany();
  await prisma.adminUser.deleteMany();
});

describe("public registration", () => {
  it("creates a MEMBER with a bcrypt hash and signs them in", async () => {
    const result = await sessions.register({ email: " New@Test.CCG ", password: PASSWORD, name: "  Ada   Lovelace " });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.user).toMatchObject({ email: "new@test.ccg", name: "Ada Lovelace", role: "MEMBER" });

    const row = await prisma.adminUser.findUniqueOrThrow({ where: { email: "new@test.ccg" } });
    expect(row.passwordHash).not.toContain(PASSWORD);
    expect(row.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(await bcrypt.compare(PASSWORD, row.passwordHash)).toBe(true);
    expect(await sessions.read(result.token)).toMatchObject({ role: "MEMBER" });
    expect(await sessions.login("new@test.ccg", PASSWORD)).not.toBeNull();
  });

  it("refuses an existing email and leaves that account unchanged", async () => {
    const first = await sessions.register({ email: "dup@test.ccg", password: PASSWORD, name: "First" });
    expect(first.ok).toBe(true);
    const before = await prisma.adminUser.findUniqueOrThrow({ where: { email: "dup@test.ccg" } });

    const second = await sessions.register({ email: "DUP@test.ccg", password: "another long password", name: "Second" });
    expect(second).toMatchObject({ ok: false, error: "email_taken" });

    expect(await prisma.adminUser.count({ where: { email: "dup@test.ccg" } })).toBe(1);
    expect(await prisma.adminUser.findUniqueOrThrow({ where: { email: "dup@test.ccg" } })).toEqual(before);
    expect(await sessions.login("dup@test.ccg", "another long password")).toBeNull();
  });

  it("never grants a staff role on sign-up", async () => {
    await prisma.adminUser.create({ data: { email: "admin@test.ccg", name: "A", role: "ADMIN", passwordHash: "x" } });
    const result = await sessions.register({ email: "admin@test.ccg", password: PASSWORD, name: "Imposter" });
    expect(result.ok).toBe(false);
    expect((await prisma.adminUser.findUniqueOrThrow({ where: { email: "admin@test.ccg" } })).name).toBe("A");
  });

  it("rejects a short password, a blank name, and a bad email without writing", async () => {
    expect(await sessions.register({ email: "a@test.ccg", password: "short", name: "Ok" })).toMatchObject({ error: "weak_password" });
    expect(await sessions.register({ email: "a@test.ccg", password: PASSWORD, name: "   " })).toMatchObject({ error: "invalid_name" });
    expect(await sessions.register({ email: "not-an-email", password: PASSWORD, name: "Ok" })).toMatchObject({ error: "invalid_email" });
    expect(await prisma.adminUser.count()).toBe(0);
  });
});

describe("every kind of account still signs in and lands on its home", () => {
  it("CLI-made ADMIN and EDITOR land on /admin, STAFF too, a member on /account", async () => {
    // Same writes as scripts/create-admin.ts.
    for (const [email, role] of [["admin@test.ccg", "ADMIN"], ["editor@test.ccg", "EDITOR"], ["staff@test.ccg", "STAFF"]] as const) {
      await prisma.adminUser.create({ data: { email, name: role, role, passwordHash: await hashPassword(PASSWORD) } });
    }
    await sessions.register({ email: "member@test.ccg", password: PASSWORD, name: "Member" });

    const home = async (email: string) => homeForRole((await sessions.login(email, PASSWORD))!.user.role);
    expect(await home("admin@test.ccg")).toBe("/admin");
    expect(await home("editor@test.ccg")).toBe("/admin");
    expect(await home("staff@test.ccg")).toBe("/admin");
    expect(await home("member@test.ccg")).toBe("/account");
  });

  it("Google links to a CLI-made ADMIN without changing its role, and to a registered member", async () => {
    await prisma.adminUser.create({ data: { email: "admin@test.ccg", name: "A", role: "ADMIN", passwordHash: await hashPassword(PASSWORD) } });
    const admin = await sessions.loginWithGoogle({ sub: "g-admin", email: "admin@test.ccg", emailVerified: true });
    expect(admin?.user.role).toBe("ADMIN");
    expect(homeForRole(admin!.user.role)).toBe("/admin");

    await sessions.register({ email: "member@test.ccg", password: PASSWORD, name: "Member" });
    const member = await sessions.loginWithGoogle({ sub: "g-member", email: "member@test.ccg", emailVerified: true });
    expect(member?.user).toMatchObject({ role: "MEMBER", name: "Member" });
    // The password still works after the Google link.
    expect(await sessions.login("member@test.ccg", PASSWORD)).not.toBeNull();
  });
});
