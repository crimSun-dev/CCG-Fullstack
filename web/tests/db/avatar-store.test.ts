import { beforeEach, describe, expect, it } from "vitest";
import { AVATAR_MAX_BYTES, createAvatarStore } from "@/lib/avatar";
import { prisma } from "./client";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 5, 6]);

let clock = new Date("2026-10-20T10:00:00Z");
const store = createAvatarStore(prisma, () => clock);
let userId: string;

beforeEach(async () => {
  await prisma.accountAvatar.deleteMany();
  await prisma.verificationCode.deleteMany();
  await prisma.adminSession.deleteMany();
  await prisma.adminUser.deleteMany();
  clock = new Date("2026-10-20T10:00:00Z");
  userId = (await prisma.adminUser.create({ data: { email: "pic@test.ccg", name: "Pic Person", role: "STAFF", passwordHash: "x" } })).id;
});

describe("profile picture store", () => {
  it("saves, replaces and removes an account's picture, versioned by time", async () => {
    expect(await store.version(userId)).toBeNull();
    expect(await store.save(userId, JPEG)).toEqual({ ok: true, updatedAt: clock });
    const first = await store.read(userId);
    expect(first?.contentType).toBe("image/jpeg");
    expect(Array.from(first!.image)).toEqual(Array.from(JPEG));

    clock = new Date(clock.getTime() + 60_000);
    await store.save(userId, PNG);
    expect((await store.read(userId))?.contentType).toBe("image/png");
    expect(await store.version(userId)).toEqual(clock);

    await store.remove(userId);
    expect(await store.read(userId)).toBeNull();
    await store.remove(userId); // removing nothing is fine
  });

  it("stores nothing that is not a small JPEG, PNG or WebP", async () => {
    expect(await store.save(userId, new TextEncoder().encode("<svg/>"))).toEqual({ ok: false, error: "avatar_type" });
    expect(await store.version(userId)).toBeNull();
  });

  it("the database itself refuses a wrong type or an oversized picture", async () => {
    const at = new Date();
    await expect(
      prisma.accountAvatar.create({ data: { userId, image: Buffer.from(JPEG), contentType: "image/svg+xml", updatedAt: at } }),
    ).rejects.toThrow();
    await expect(
      prisma.accountAvatar.create({ data: { userId, image: Buffer.alloc(AVATAR_MAX_BYTES + 1), contentType: "image/jpeg", updatedAt: at } }),
    ).rejects.toThrow();
  });

  it("goes with the account", async () => {
    await store.save(userId, JPEG);
    await prisma.adminUser.delete({ where: { id: userId } });
    expect(await prisma.accountAvatar.count()).toBe(0);
  });
});
