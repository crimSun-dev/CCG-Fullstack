import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import type { Mailer } from "./mailer";
import { isPublicPath, type ProgramCode } from "./publish-gate";

export type LeadInterest = ProgramCode | "general";

export type LeadInput = {
  name: string;
  email: string;
  phone?: string;
  organization?: string;
  interest: LeadInterest;
  message?: string;
  consent: true;
  companyWebsite?: string;
};

export type RequestMeta = { ip: string; userAgent: string | null };

export type LeadReceipt =
  | { ok: true; id: string }
  | { ok: false; error: "RATE_LIMITED" | "INVALID" | "NO_CONSENT" };

export interface LeadService {
  submit(input: unknown, meta: RequestMeta): Promise<LeadReceipt>;
}

export const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
export const RATE_LIMIT_MAX_ATTEMPTS = 5;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

const codePointLength = (s: string) => [...s].length;

const leadSchema = z.object({
  name: z
    .string()
    .trim()
    .refine((s) => codePointLength(s) >= 1 && codePointLength(s) <= 120),
  email: z
    .string()
    .trim()
    .max(320)
    .regex(/^[^@\s]+@[^@\s]+$/),
  phone: optionalText(40),
  organization: optionalText(200),
  // The gate is the only source of interest codes; "general" is the one extra value.
  interest: z.string().refine((v): v is LeadInterest => v === "general" || isPublicPath(v)),
  message: optionalText(2000),
});

type ParsedLead = z.infer<typeof leadSchema>;

type Verdict =
  | { kind: "honeypot" }
  | { kind: "no_consent" }
  | { kind: "invalid" }
  | { kind: "ok"; lead: ParsedLead };

// Pure: no query runs before the input has a verdict.
export function judgeLeadInput(input: unknown): Verdict {
  if (typeof input !== "object" || input === null) return { kind: "invalid" };
  const raw = input as Record<string, unknown>;
  if (typeof raw.companyWebsite === "string" && raw.companyWebsite.trim() !== "") return { kind: "honeypot" };
  if (raw.consent !== true) return { kind: "no_consent" };
  const parsed = leadSchema.safeParse(raw);
  return parsed.success ? { kind: "ok", lead: parsed.data } : { kind: "invalid" };
}

export function hashIp(ip: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

export function createLeadService(deps: { prisma: PrismaClient; mailer: Mailer; ipSalt: string }): LeadService {
  const { prisma, mailer, ipSalt } = deps;

  return {
    async submit(input, meta) {
      const verdict = judgeLeadInput(input);
      const ipHash = hashIp(meta.ip, ipSalt);

      // Every post counts toward the limit, valid or not. The attempt and the lead commit together;
      // the email call stays outside this transaction (TDD 5.3).
      const outcome = await prisma.$transaction(async (tx) => {
        await tx.leadAttempt.create({ data: { ipHash } });
        const recent = await tx.leadAttempt.count({
          where: { ipHash, createdAt: { gte: new Date(Date.now() - RATE_LIMIT_WINDOW_MS) } },
        });
        if (recent > RATE_LIMIT_MAX_ATTEMPTS) return { kind: "rate_limited" as const };
        if (verdict.kind !== "ok") return verdict;

        const { lead } = verdict;
        const row = await tx.lead.create({
          data: {
            name: lead.name,
            email: lead.email,
            phone: lead.phone ?? null,
            organization: lead.organization ?? null,
            interest: lead.interest,
            message: lead.message ?? null,
            consentAt: new Date(),
            emailStatus: "PENDING",
          },
        });
        return { kind: "saved" as const, row };
      });

      switch (outcome.kind) {
        case "rate_limited":
          return { ok: false, error: "RATE_LIMITED" };
        case "no_consent":
          return { ok: false, error: "NO_CONSENT" };
        case "invalid":
          return { ok: false, error: "INVALID" };
        case "honeypot":
          // Indistinguishable from a real receipt, so a naive bot learns nothing. Nothing is stored.
          return { ok: true, id: randomUUID() };
        case "saved": {
          const { row } = outcome;
          const mail = await mailer.sendLeadNotice({
            id: row.id,
            name: row.name,
            email: row.email,
            interest: row.interest,
            message: row.message,
          });
          if (mail.status === "FAILED") console.warn(`[lead] email failed for ${row.id}: ${mail.reason}`);
          await prisma.lead.update({ where: { id: row.id }, data: { emailStatus: mail.status } });
          return { ok: true, id: row.id };
        }
      }
    },
  };
}
