import { createHash, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@/generated/prisma/client";
import type { CodePurpose, Mailer } from "./mailer";
import {
  cleanName,
  hashPassword,
  isEmail,
  isOwnerEmail,
  NAME_MAX,
  normalizeEmail,
  passwordProblem,
} from "./session-service";

// Self-service upkeep for a signed-in account, and the emailed one-time codes behind a password
// reset and an email change. Sessions themselves stay in SessionService.

export const CODE_TTL_MINUTES = 15;
// A 6-digit code has a million values. Five wrong tries kill it, so guessing one is a 1-in-200,000 shot.
export const CODE_MAX_ATTEMPTS = 5;
// One new code per account and purpose per minute, so the form cannot be used to flood an inbox.
export const CODE_RESEND_SECONDS = 60;

export type AccountFailure = { ok: false; error: string; message: string };
export type AccountResult = { ok: true } | AccountFailure;

export interface AccountService {
  updateName(userId: string, name: string): Promise<AccountResult>;
  // Every other session of the account is revoked; `keepTokenHash` is the one making the change.
  changePassword(userId: string, input: { current: string; next: string; keepTokenHash?: string }): Promise<AccountResult>;
  // Always resolves the same way, whether or not the email has an account.
  requestPasswordReset(email: string, origin: string): Promise<void>;
  resetPassword(input: { email: string; code: string; password: string }): Promise<AccountResult>;
  requestEmailChange(userId: string, newEmail: string, origin: string): Promise<AccountResult>;
  confirmEmailChange(userId: string, code: string, origin: string): Promise<AccountResult>;
}

const fail = (error: string, message: string): AccountFailure => ({ ok: false, error, message });
const INVALID_CODE = fail("invalid_code", "That code is wrong or has expired. Ask for a new one.");

function hashCode(rowId: string, code: string): string {
  return createHash("sha256").update(`${rowId}:${code}`).digest("hex");
}

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

export function newCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function createAccountService(deps: {
  prisma: PrismaClient;
  mailer: Mailer;
  now?: () => Date;
  generateCode?: () => string;
}): AccountService {
  const { prisma, mailer } = deps;
  const now = deps.now ?? (() => new Date());
  const generateCode = deps.generateCode ?? newCode;

  // Voids any live code for this purpose, then stores a fresh one. Returns null inside the resend window.
  async function issueCode(userId: string, purpose: CodePurpose, newEmail: string | null): Promise<string | null> {
    const at = now();
    const recent = await prisma.verificationCode.findFirst({
      where: { userId, purpose, createdAt: { gt: new Date(at.getTime() - CODE_RESEND_SECONDS * 1000) } },
    });
    if (recent) return null;

    await prisma.verificationCode.updateMany({ where: { userId, purpose, consumedAt: null }, data: { consumedAt: at } });
    const code = generateCode();
    const id = randomUUID();
    await prisma.verificationCode.create({
      data: {
        id,
        userId,
        purpose,
        newEmail,
        codeHash: hashCode(id, code),
        createdAt: at,
        expiresAt: new Date(at.getTime() + CODE_TTL_MINUTES * 60 * 1000),
      },
    });
    return code;
  }

  // Spends the live code if it matches. A wrong guess costs an attempt. Returns the row on success.
  async function spendCode(userId: string, purpose: CodePurpose, code: string) {
    const at = now();
    const row = await prisma.verificationCode.findFirst({
      where: { userId, purpose, consumedAt: null, expiresAt: { gt: at }, attempts: { lt: CODE_MAX_ATTEMPTS } },
      orderBy: { createdAt: "desc" },
    });
    if (!row) return null;
    if (!/^\d{6}$/.test(code) || !sameHash(hashCode(row.id, code), row.codeHash)) {
      await prisma.verificationCode.updateMany({ where: { id: row.id, consumedAt: null }, data: { attempts: { increment: 1 } } });
      return null;
    }
    // The consumedAt: null filter makes two simultaneous submissions of one code spend it once.
    const { count } = await prisma.verificationCode.updateMany({
      where: { id: row.id, consumedAt: null },
      data: { consumedAt: at },
    });
    return count === 1 ? row : null;
  }

  return {
    async updateName(userId, name) {
      const fullName = cleanName(name);
      if (!fullName) return fail("invalid_name", `Enter your full name (up to ${NAME_MAX} characters).`);
      await prisma.adminUser.update({ where: { id: userId }, data: { name: fullName } });
      return { ok: true };
    },

    async changePassword(userId, { current, next, keepTokenHash }) {
      const user = await prisma.adminUser.findUnique({ where: { id: userId } });
      if (!user || !(await bcrypt.compare(current, user.passwordHash))) {
        return fail("wrong_password", "The current password is incorrect.");
      }
      const weak = passwordProblem(next);
      if (weak) return fail("weak_password", weak);
      await prisma.adminUser.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } });
      await prisma.adminSession.updateMany({
        where: { userId, revokedAt: null, ...(keepTokenHash ? { NOT: { tokenHash: keepTokenHash } } : {}) },
        data: { revokedAt: now() },
      });
      return { ok: true };
    },

    async requestPasswordReset(email, origin) {
      const user = await prisma.adminUser.findUnique({ where: { email: normalizeEmail(email) } });
      if (!user) return;
      const code = await issueCode(user.id, "PASSWORD_RESET", null);
      if (!code) return;
      await mailer.sendCode({ to: user.email, name: user.name, purpose: "PASSWORD_RESET", code, minutes: CODE_TTL_MINUTES, origin });
    },

    async resetPassword({ email, code, password }) {
      const weak = passwordProblem(password);
      if (weak) return fail("weak_password", weak);
      const user = await prisma.adminUser.findUnique({ where: { email: normalizeEmail(email) } });
      if (!user) return INVALID_CODE;
      if (!(await spendCode(user.id, "PASSWORD_RESET", code.trim()))) return INVALID_CODE;
      await prisma.adminUser.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } });
      // Whoever knew the old password may still hold a session. A reset ends all of them.
      await prisma.adminSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now() } });
      return { ok: true };
    },

    async requestEmailChange(userId, newEmail, origin) {
      const target = normalizeEmail(newEmail);
      if (!isEmail(target)) return fail("invalid_email", "Enter a valid email address.");
      const user = await prisma.adminUser.findUniqueOrThrow({ where: { id: userId } });
      if (target === user.email) return fail("same_email", "That is already your email.");
      // The owner mailbox stays on that address; nobody may claim it from another account either.
      if (user.role === "OWNER" || isOwnerEmail(user.email) || isOwnerEmail(target)) {
        return fail("owner_email", "The owner email cannot be changed or claimed.");
      }
      // A taken address gets the same answer as a free one, so this form cannot list accounts.
      if (await prisma.adminUser.findUnique({ where: { email: target } })) return { ok: true };
      const code = await issueCode(user.id, "EMAIL_CHANGE", target);
      if (!code) return fail("throttled", `A code was sent less than ${CODE_RESEND_SECONDS} seconds ago. Check your inbox.`);
      await mailer.sendCode({ to: target, name: user.name, purpose: "EMAIL_CHANGE", code, minutes: CODE_TTL_MINUTES, origin });
      return { ok: true };
    },

    async confirmEmailChange(userId, code, origin) {
      const row = await spendCode(userId, "EMAIL_CHANGE", code.trim());
      if (!row?.newEmail) return INVALID_CODE;
      const user = await prisma.adminUser.findUniqueOrThrow({ where: { id: userId } });
      try {
        await prisma.adminUser.update({ where: { id: userId }, data: { email: row.newEmail } });
      } catch (err) {
        if ((err as { code?: string }).code === "P2002") return fail("email_taken", "That email now belongs to another account.");
        throw err;
      }
      await mailer.sendEmailChanged({ to: user.email, name: user.name, newEmail: row.newEmail, origin });
      return { ok: true };
    },
  };
}
