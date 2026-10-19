import { beforeEach, describe, expect, it } from "vitest";
import { CODE_MAX_ATTEMPTS, CODE_RESEND_SECONDS, CODE_TTL_MINUTES, createAccountService } from "@/lib/account-service";
import type { CodeMessage, EmailChangedMessage, Mailer, MailResult } from "@/lib/mailer";
import { createSessionService, hashPassword, hashToken } from "@/lib/session-service";
import { prisma } from "./client";

const PASSWORD = "the original password";
const NEW_PASSWORD = "a brand new password";
const ORIGIN = "https://ajarin.org";

function capturingMailer() {
  const codes: CodeMessage[] = [];
  const changed: EmailChangedMessage[] = [];
  const mailer: Mailer = {
    async sendLeadNotice(): Promise<MailResult> {
      return { status: "SENT" };
    },
    async sendCode(m) {
      codes.push(m);
      return { status: "SENT" };
    },
    async sendEmailChanged(m) {
      changed.push(m);
      return { status: "SENT" };
    },
  };
  return { mailer, codes, changed };
}

let clock = new Date("2026-10-19T10:00:00Z");
const advance = (seconds: number) => (clock = new Date(clock.getTime() + seconds * 1000));
let mail: ReturnType<typeof capturingMailer>;
let accounts: ReturnType<typeof createAccountService>;
const sessions = createSessionService(prisma);
let userId: string;

beforeEach(async () => {
  await prisma.verificationCode.deleteMany();
  await prisma.adminSession.deleteMany();
  await prisma.adminUser.deleteMany();
  clock = new Date("2026-10-19T10:00:00Z");
  mail = capturingMailer();
  accounts = createAccountService({ prisma, mailer: mail.mailer, now: () => clock });
  const user = await prisma.adminUser.create({
    data: { email: "member@test.ccg", name: "Member One", role: "MEMBER", passwordHash: await hashPassword(PASSWORD) },
  });
  userId = user.id;
});

describe("account maintenance", () => {
  it("saves a new full name", async () => {
    expect(await accounts.updateName(userId, "  Draven   Chen ")).toEqual({ ok: true });
    const { token } = (await sessions.login("member@test.ccg", PASSWORD))!;
    expect((await sessions.read(token))?.name).toBe("Draven Chen");
    expect(await accounts.updateName(userId, " ")).toMatchObject({ ok: false, error: "invalid_name" });
  });

  it("changes the password only with the right current one, and signs out other sessions", async () => {
    const mine = (await sessions.login("member@test.ccg", PASSWORD))!;
    const other = (await sessions.login("member@test.ccg", PASSWORD))!;

    expect(await accounts.changePassword(userId, { current: "wrong password!!", next: NEW_PASSWORD })).toMatchObject({
      error: "wrong_password",
    });
    expect(await accounts.changePassword(userId, { current: PASSWORD, next: "short" })).toMatchObject({ error: "weak_password" });
    expect(await sessions.login("member@test.ccg", PASSWORD)).not.toBeNull();

    const ok = await accounts.changePassword(userId, { current: PASSWORD, next: NEW_PASSWORD, keepTokenHash: hashToken(mine.token) });
    expect(ok).toEqual({ ok: true });
    expect(await sessions.login("member@test.ccg", PASSWORD)).toBeNull();
    expect(await sessions.login("member@test.ccg", NEW_PASSWORD)).not.toBeNull();
    expect(await sessions.read(mine.token)).not.toBeNull();
    expect(await sessions.read(other.token)).toBeNull();
  });
});

describe("password reset", () => {
  it("emails a code that sets the password once, then never again", async () => {
    const session = (await sessions.login("member@test.ccg", PASSWORD))!;
    await accounts.requestPasswordReset("Member@Test.ccg", ORIGIN);
    expect(mail.codes).toHaveLength(1);
    const [msg] = mail.codes;
    expect(msg).toMatchObject({ to: "member@test.ccg", purpose: "PASSWORD_RESET", minutes: CODE_TTL_MINUTES, origin: ORIGIN });
    expect(msg.code).toMatch(/^\d{6}$/);

    const row = await prisma.verificationCode.findFirstOrThrow();
    expect(row.codeHash).not.toContain(msg.code);

    expect(await accounts.resetPassword({ email: "member@test.ccg", code: msg.code, password: NEW_PASSWORD })).toEqual({ ok: true });
    expect(await sessions.login("member@test.ccg", NEW_PASSWORD)).not.toBeNull();
    expect(await sessions.login("member@test.ccg", PASSWORD)).toBeNull();
    // A reset ends every existing session.
    expect(await sessions.read(session.token)).toBeNull();

    const again = await accounts.resetPassword({ email: "member@test.ccg", code: msg.code, password: "yet another password" });
    expect(again).toMatchObject({ ok: false, error: "invalid_code" });
    expect(await sessions.login("member@test.ccg", NEW_PASSWORD)).not.toBeNull();
  });

  it("says nothing and sends nothing for an unknown email", async () => {
    await expect(accounts.requestPasswordReset("nobody@test.ccg", ORIGIN)).resolves.toBeUndefined();
    expect(mail.codes).toHaveLength(0);
    expect(await prisma.verificationCode.count()).toBe(0);
  });

  it("refuses an expired code", async () => {
    await accounts.requestPasswordReset("member@test.ccg", ORIGIN);
    advance(CODE_TTL_MINUTES * 60 + 1);
    const result = await accounts.resetPassword({ email: "member@test.ccg", code: mail.codes[0].code, password: NEW_PASSWORD });
    expect(result).toMatchObject({ error: "invalid_code" });
    expect(await sessions.login("member@test.ccg", PASSWORD)).not.toBeNull();
  });

  it("kills a code after too many wrong tries, even if the right one follows", async () => {
    await accounts.requestPasswordReset("member@test.ccg", ORIGIN);
    const right = mail.codes[0].code;
    const wrong = right === "000000" ? "111111" : "000000";
    for (let i = 0; i < CODE_MAX_ATTEMPTS; i++) {
      await accounts.resetPassword({ email: "member@test.ccg", code: wrong, password: NEW_PASSWORD });
    }
    expect(await accounts.resetPassword({ email: "member@test.ccg", code: right, password: NEW_PASSWORD })).toMatchObject({
      error: "invalid_code",
    });
  });

  it("sends at most one code a minute, and a newer code voids the older", async () => {
    await accounts.requestPasswordReset("member@test.ccg", ORIGIN);
    await accounts.requestPasswordReset("member@test.ccg", ORIGIN);
    expect(mail.codes).toHaveLength(1);

    advance(CODE_RESEND_SECONDS + 1);
    await accounts.requestPasswordReset("member@test.ccg", ORIGIN);
    expect(mail.codes).toHaveLength(2);
    const [first, second] = mail.codes.map((m) => m.code);
    if (first !== second) {
      expect(await accounts.resetPassword({ email: "member@test.ccg", code: first, password: NEW_PASSWORD })).toMatchObject({
        error: "invalid_code",
      });
    }
    expect(await accounts.resetPassword({ email: "member@test.ccg", code: second, password: NEW_PASSWORD })).toEqual({ ok: true });
  });
});

describe("email change", () => {
  it("moves the account to the new email after its code, and tells the old address", async () => {
    expect(await accounts.requestEmailChange(userId, "New@Test.ccg", ORIGIN)).toEqual({ ok: true });
    expect(mail.codes).toHaveLength(1);
    expect(mail.codes[0]).toMatchObject({ to: "new@test.ccg", purpose: "EMAIL_CHANGE" });
    // Nothing moves until the code comes back.
    expect((await prisma.adminUser.findUniqueOrThrow({ where: { id: userId } })).email).toBe("member@test.ccg");

    expect(await accounts.confirmEmailChange(userId, mail.codes[0].code, ORIGIN)).toEqual({ ok: true });
    expect((await prisma.adminUser.findUniqueOrThrow({ where: { id: userId } })).email).toBe("new@test.ccg");
    expect(mail.changed).toEqual([{ to: "member@test.ccg", name: "Member One", newEmail: "new@test.ccg", origin: ORIGIN }]);
    expect(await sessions.login("new@test.ccg", PASSWORD)).not.toBeNull();
    expect(await sessions.login("member@test.ccg", PASSWORD)).toBeNull();

    expect(await accounts.confirmEmailChange(userId, mail.codes[0].code, ORIGIN)).toMatchObject({ error: "invalid_code" });
  });

  it("does not reveal or take an address that belongs to someone else", async () => {
    await prisma.adminUser.create({ data: { email: "taken@test.ccg", name: "Other", role: "MEMBER", passwordHash: "x" } });
    expect(await accounts.requestEmailChange(userId, "taken@test.ccg", ORIGIN)).toEqual({ ok: true });
    expect(mail.codes).toHaveLength(0);
    expect(await accounts.requestEmailChange(userId, "member@test.ccg", ORIGIN)).toMatchObject({ error: "same_email" });
    expect(await accounts.requestEmailChange(userId, "nope", ORIGIN)).toMatchObject({ error: "invalid_email" });
  });

  it("refuses a code issued for another account", async () => {
    const other = await prisma.adminUser.create({
      data: { email: "other@test.ccg", name: "Other", role: "MEMBER", passwordHash: "x" },
    });
    await accounts.requestEmailChange(userId, "fresh@test.ccg", ORIGIN);
    expect(await accounts.confirmEmailChange(other.id, mail.codes[0].code, ORIGIN)).toMatchObject({ error: "invalid_code" });
    expect((await prisma.adminUser.findUniqueOrThrow({ where: { id: other.id } })).email).toBe("other@test.ccg");
  });
});
