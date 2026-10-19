import { Resend } from "resend";

export type MailResult = { status: "SENT" } | { status: "FAILED"; reason: string };

export type LeadNotice = {
  id: string;
  name: string;
  email: string;
  interest: string;
  message: string | null;
};

export interface Mailer {
  sendLeadNotice(lead: LeadNotice): Promise<MailResult>;
}

export const MAIL_TIMEOUT_MS = 2000;

// The visitor's request never waits on email longer than this budget.
export async function withTimeout(send: Promise<MailResult>, ms = MAIL_TIMEOUT_MS): Promise<MailResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<MailResult>((resolve) => {
    timer = setTimeout(() => resolve({ status: "FAILED", reason: `timeout after ${ms}ms` }), ms);
  });
  try {
    return await Promise.race([
      send.catch((err: unknown): MailResult => ({ status: "FAILED", reason: errorMessage(err) })),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function noticeText(lead: LeadNotice): string {
  return [
    `New enquiry from the CK Coaching Group website`,
    ``,
    `Name: ${lead.name}`,
    `Email: ${lead.email}`,
    `Interest: ${lead.interest}`,
    ``,
    lead.message ?? "(no message)",
    ``,
    `Lead id: ${lead.id}`,
  ].join("\n");
}

export function createResendMailer(opts: { apiKey: string; from: string; to: string }): Mailer {
  const resend = new Resend(opts.apiKey);
  return {
    sendLeadNotice(lead) {
      const send = resend.emails
        .send({
          from: opts.from,
          to: opts.to,
          replyTo: lead.email,
          subject: `Website enquiry: ${lead.interest}`,
          text: noticeText(lead),
        })
        .then(({ error }): MailResult => (error ? { status: "FAILED", reason: error.message } : { status: "SENT" }));
      return withTimeout(send);
    },
  };
}

// Local dev without a Resend key: the payload goes to the server log.
export function createLogMailer(to: string): Mailer {
  return {
    async sendLeadNotice(lead) {
      console.info(`[mailer:dev] lead notice to ${to}\n${noticeText(lead)}`);
      return { status: "SENT" };
    },
  };
}
