import { beforeEach, describe, expect, it } from "vitest";
import { createLeadService, type RequestMeta } from "@/lib/lead-service";
import type { Mailer, MailResult } from "@/lib/mailer";
import { prisma } from "./client";

const SALT = "test-salt-long-enough-for-env";

function stubMailer(result: MailResult | (() => Promise<MailResult>)): Mailer & { calls: number } {
  const mailer = {
    calls: 0,
    async sendLeadNotice() {
      mailer.calls += 1;
      return typeof result === "function" ? result() : result;
    },
    async sendCode(): Promise<MailResult> {
      return { status: "SENT" };
    },
    async sendEmailChanged(): Promise<MailResult> {
      return { status: "SENT" };
    },
  };
  return mailer;
}

// Each test gets its own IP so the rate limit never leaks between tests.
let ipCounter = 0;
const freshMeta = (): RequestMeta => ({ ip: `198.51.100.${++ipCounter}`, userAgent: "vitest" });

const valid = {
  name: "Dewi Lestari",
  email: "dewi@example.com",
  interest: "group-coaching",
  consent: true,
};

beforeEach(async () => {
  await prisma.lead.deleteMany();
  await prisma.leadAttempt.deleteMany();
});

describe("LeadService.submit", () => {
  it("saves a valid lead and marks the email SENT", async () => {
    const mailer = stubMailer({ status: "SENT" });
    const service = createLeadService({ prisma, mailer, ipSalt: SALT });

    const receipt = await service.submit(valid, freshMeta());

    expect(receipt.ok).toBe(true);
    const rows = await prisma.lead.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email: "dewi@example.com", emailStatus: "SENT", interest: "group-coaching" });
    expect(rows[0]?.consentAt).toBeInstanceOf(Date);
    expect(mailer.calls).toBe(1);
  });

  it("test_lead_requires_consent", async () => {
    const service = createLeadService({ prisma, mailer: stubMailer({ status: "SENT" }), ipSalt: SALT });
    const receipt = await service.submit({ ...valid, consent: false }, freshMeta());
    expect(receipt).toEqual({ ok: false, error: "NO_CONSENT" });
    expect(await prisma.lead.count()).toBe(0);
  });

  it("test_lead_rejects_internship_interest", async () => {
    const service = createLeadService({ prisma, mailer: stubMailer({ status: "SENT" }), ipSalt: SALT });
    const receipt = await service.submit({ ...valid, interest: "internship" }, freshMeta());
    expect(receipt).toEqual({ ok: false, error: "INVALID" });
    expect(await prisma.lead.count()).toBe(0);
  });

  it("test_lead_honeypot_inserts_nothing", async () => {
    const mailer = stubMailer({ status: "SENT" });
    const service = createLeadService({ prisma, mailer, ipSalt: SALT });
    const receipt = await service.submit({ ...valid, companyWebsite: "http://spam.example" }, freshMeta());
    expect(receipt.ok).toBe(true);
    expect(await prisma.lead.count()).toBe(0);
    expect(mailer.calls).toBe(0);
  });

  it("test_lead_rate_limit_sixth_attempt", async () => {
    const service = createLeadService({ prisma, mailer: stubMailer({ status: "SENT" }), ipSalt: SALT });
    const meta = freshMeta();

    // Five posts, valid and invalid mixed, each judged on its own merits.
    expect((await service.submit(valid, meta)).ok).toBe(true);
    expect(await service.submit({ ...valid, consent: false }, meta)).toEqual({ ok: false, error: "NO_CONSENT" });
    expect((await service.submit({ ...valid, email: "two@example.com" }, meta)).ok).toBe(true);
    expect(await service.submit({ ...valid, interest: "camp" }, meta)).toEqual({ ok: false, error: "INVALID" });
    expect((await service.submit({ ...valid, email: "three@example.com" }, meta)).ok).toBe(true);
    expect(await prisma.lead.count()).toBe(3);

    const sixth = await service.submit({ ...valid, email: "six@example.com" }, meta);
    expect(sixth).toEqual({ ok: false, error: "RATE_LIMITED" });
    expect(await prisma.lead.count()).toBe(3);

    // A different visitor is unaffected.
    expect((await service.submit(valid, freshMeta())).ok).toBe(true);
  });

  it("stores only the salted hash of the IP", async () => {
    const service = createLeadService({ prisma, mailer: stubMailer({ status: "SENT" }), ipSalt: SALT });
    const meta = freshMeta();
    await service.submit(valid, meta);
    const attempts = await prisma.leadAttempt.findMany();
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.ipHash).not.toContain(meta.ip);
  });

  it("test_lead_saved_when_mailer_fails", async () => {
    const service = createLeadService({
      prisma,
      mailer: stubMailer({ status: "FAILED", reason: "provider 503" }),
      ipSalt: SALT,
    });
    const receipt = await service.submit(valid, freshMeta());
    expect(receipt.ok).toBe(true);
    const row = await prisma.lead.findFirstOrThrow();
    expect(row.emailStatus).toBe("FAILED");
    expect(row.email).toBe("dewi@example.com");
  });

  it("test_lead_unicode_name_round_trips", async () => {
    const service = createLeadService({ prisma, mailer: stubMailer({ status: "SENT" }), ipSalt: SALT });
    const name = ("Siti Nurhaliza 김민준 สมชาย Ñúñez " + "李".repeat(80)).slice(0, 80);
    expect([...name].length).toBe(80);

    const receipt = await service.submit({ ...valid, name }, freshMeta());
    expect(receipt.ok).toBe(true);
    const row = await prisma.lead.findFirstOrThrow();
    expect(row.name).toBe(name);
  });
});
