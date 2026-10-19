import { beforeAll, describe, expect, it } from "vitest";
import { createSessionService, hashPassword, hashToken } from "@/lib/session-service";
import { prisma } from "./client";

const sessions = createSessionService(prisma);
const EMAIL = "editor@test.ccg";
const PASSWORD = "correct horse battery staple";

beforeAll(async () => {
  await prisma.adminSession.deleteMany();
  await prisma.adminUser.deleteMany();
  await prisma.adminUser.create({
    data: { email: EMAIL, name: "Test Editor", role: "EDITOR", passwordHash: await hashPassword(PASSWORD) },
  });
});

describe("SessionService", () => {
  it("rejects a wrong password and an unknown email", async () => {
    expect(await sessions.login(EMAIL, "wrong password")).toBeNull();
    expect(await sessions.login("nobody@test.ccg", PASSWORD)).toBeNull();
  });

  it("stores only the token hash and reads the user back", async () => {
    const result = await sessions.login(EMAIL, PASSWORD);
    expect(result?.user).toMatchObject({ email: EMAIL, role: "EDITOR" });
    const token = result!.token;

    const row = await prisma.adminSession.findUniqueOrThrow({ where: { tokenHash: hashToken(token) } });
    expect(row.tokenHash).not.toBe(token);
    expect(await sessions.read(token)).toMatchObject({ email: EMAIL });
  });

  it("test_revoked_session_cannot_open_admin (service half)", async () => {
    const { token } = (await sessions.login(EMAIL, PASSWORD))!;
    await sessions.revoke(token);
    expect(await sessions.read(token)).toBeNull();
  });

  it("an expired session reads as null", async () => {
    const { token } = (await sessions.login(EMAIL, PASSWORD))!;
    await prisma.adminSession.update({
      where: { tokenHash: hashToken(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await sessions.read(token)).toBeNull();
  });
});
