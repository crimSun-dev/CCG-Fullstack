import { beforeAll, describe, expect, it } from "vitest";
import { createGoogleOidc } from "@/lib/google-oidc";
import { createSessionService, hashPassword, hashToken } from "@/lib/session-service";
import { CLIENT, fakeGoogleFetch, idToken, NONCE, REDIRECT_URI } from "../google-fake";
import { prisma } from "./client";

// Google's token endpoint is mocked (tests/google-fake.ts). Everything after the ID token is the
// real link order against real admin_user and admin_session rows.

const sessions = createSessionService(prisma);
const EMAIL = "google-editor@test.ccg";
const PASSWORD = "correct horse battery staple";
const SUB = "google-sub-editor";

async function signInWithGoogle(claims: Record<string, unknown>) {
  const oidc = createGoogleOidc(CLIENT, { fetch: fakeGoogleFetch(idToken(claims)).fetch });
  const identity = await oidc.exchangeCode({ code: "auth-code", redirectUri: REDIRECT_URI, nonce: NONCE });
  return identity ? sessions.loginWithGoogle(identity) : null;
}

const counts = async () => ({ users: await prisma.adminUser.count(), sessions: await prisma.adminSession.count() });

beforeAll(async () => {
  await prisma.adminSession.deleteMany();
  await prisma.adminUser.deleteMany();
  await prisma.adminUser.create({
    data: { email: EMAIL, name: "Google Editor", role: "EDITOR", passwordHash: await hashPassword(PASSWORD) },
  });
});

describe("Google sign-in link order", () => {
  it("(d) an unverified email writes nothing, even when it matches a staff row", async () => {
    const before = await counts();
    expect(await signInWithGoogle({ sub: SUB, email: EMAIL, email_verified: false })).toBeNull();
    expect(await counts()).toEqual(before);
    expect((await prisma.adminUser.findUniqueOrThrow({ where: { email: EMAIL } })).googleSub).toBeNull();
  });

  it("(c) a verified email that matches no row becomes a general member", async () => {
    const before = await counts();
    const result = await signInWithGoogle({ sub: "google-sub-stranger", email: "stranger@gmail.test", email_verified: true });
    expect(result?.user).toMatchObject({ email: "stranger@gmail.test", role: "MEMBER" });
    expect(await counts()).toEqual({ users: before.users + 1, sessions: before.sessions + 1 });
    const row = await prisma.adminUser.findUniqueOrThrow({ where: { googleSub: "google-sub-stranger" } });
    expect(row.role).toBe("MEMBER");
  });

  it("(a) a matching verified email links googleSub and signs in", async () => {
    // Mixed case and spaces: the email is normalized the same way admin:create stores it.
    const result = await signInWithGoogle({ sub: SUB, email: "  Google-Editor@Test.CCG ", email_verified: true });
    expect(result?.user).toMatchObject({ email: EMAIL, role: "EDITOR" });

    expect((await prisma.adminUser.findUniqueOrThrow({ where: { email: EMAIL } })).googleSub).toBe(SUB);
    const row = await prisma.adminSession.findUniqueOrThrow({ where: { tokenHash: hashToken(result!.token) } });
    expect(row.tokenHash).not.toBe(result!.token);
    expect(await sessions.read(result!.token)).toMatchObject({ email: EMAIL });
  });

  it("(b) a second sign-in resolves by the stored googleSub, even after a Google email change", async () => {
    const result = await signInWithGoogle({ sub: SUB, email: "renamed@gmail.test", email_verified: true });
    expect(result?.user.email).toBe(EMAIL);
    expect(await sessions.read(result!.token)).toMatchObject({ email: EMAIL });
  });

  it("a different Google subject cannot take over a row that is already linked", async () => {
    const before = await counts();
    expect(await signInWithGoogle({ sub: "google-sub-other", email: EMAIL, email_verified: true })).toBeNull();
    expect(await counts()).toEqual(before);
    expect((await prisma.adminUser.findUniqueOrThrow({ where: { email: EMAIL } })).googleSub).toBe(SUB);
  });

  it("(e) email and password login still works and still rejects a wrong password", async () => {
    expect(await sessions.login(EMAIL, "wrong password")).toBeNull();
    const result = await sessions.login(EMAIL, PASSWORD);
    expect(result?.user.email).toBe(EMAIL);
    expect(await sessions.read(result!.token)).toMatchObject({ email: EMAIL });
  });

  it("(f) logout revokes a Google-started session", async () => {
    const { token } = (await signInWithGoogle({ sub: SUB, email: EMAIL, email_verified: true }))!;
    await sessions.revoke(token);
    expect(await sessions.read(token)).toBeNull();
    expect((await prisma.adminSession.findUniqueOrThrow({ where: { tokenHash: hashToken(token) } })).revokedAt).not.toBeNull();
  });
});
