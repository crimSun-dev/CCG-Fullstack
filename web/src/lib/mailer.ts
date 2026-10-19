import { Resend } from "resend";

export type MailResult = { status: "SENT" } | { status: "FAILED"; reason: string };

export type LeadNotice = {
  id: string;
  name: string;
  email: string;
  interest: string;
  message: string | null;
};

export type CodePurpose = "PASSWORD_RESET" | "EMAIL_CHANGE";

// `origin` is the canonical public site (siteOrigin()), never the bind address.
export type CodeMessage = { to: string; name: string; purpose: CodePurpose; code: string; minutes: number; origin: string };
export type EmailChangedMessage = { to: string; name: string; newEmail: string; origin: string };

export interface Mailer {
  sendLeadNotice(lead: LeadNotice): Promise<MailResult>;
  sendCode(message: CodeMessage): Promise<MailResult>;
  sendEmailChanged(message: EmailChangedMessage): Promise<MailResult>;
}

export type RenderedMail = { subject: string; text: string; html: string };

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

// CCG brand palette. Email clients ignore CSS variables, so the values are inlined.
const INK = "#030507";
const BLUE = "#1088f8";
const BLUE_MID = "#3e9ff8";
const BLUE_SOFT = "#70b8f8";

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function trimOrigin(origin: string): string {
  return origin.replace(/\/+$/, "");
}

// Table layout and inline styles: the subset Gmail and Outlook both render. The mark is a PNG
// because neither client shows SVG.
function brandedHtml(opts: {
  origin: string;
  heading: string;
  lines: string[];
  code?: string;
  link?: { href: string; label: string };
}): string {
  const origin = trimOrigin(opts.origin);
  const code = opts.code
    ? `<tr><td style="padding:8px 32px 24px"><div style="font:700 32px/1 ui-monospace,Menlo,Consolas,monospace;letter-spacing:8px;color:${INK};background:#eef6fe;border-left:4px solid ${BLUE};padding:18px 20px">${esc(opts.code)}</div></td></tr>`
    : "";
  const link = opts.link
    ? `<tr><td style="padding:0 32px 28px"><a href="${esc(opts.link.href)}" style="display:inline-block;background:${BLUE};color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:2px">${esc(opts.link.label)}</a></td></tr>`
    : "";
  const body = opts.lines.map((l) => `<p style="margin:0 0 12px">${esc(l)}</p>`).join("");
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f1f3f5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f3f5"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;font:16px/1.55 Arial,Helvetica,sans-serif;color:${INK}">
<tr><td style="background:${INK};padding:20px 32px;border-bottom:3px solid ${BLUE}"><img src="${esc(origin)}/brand/ccg-mark-email.png" width="37" height="43" alt="CK Coaching Group" style="display:inline-block;vertical-align:middle;border:0"><span style="display:inline-block;vertical-align:middle;margin-left:12px;color:#eef2f6;font-weight:800;font-size:15px">CK Coaching Group</span></td></tr>
<tr><td style="height:3px;background:${BLUE_MID};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:28px 32px 8px"><h1 style="margin:0 0 16px;font-size:24px;line-height:1.2">${esc(opts.heading)}</h1>${body}</td></tr>
${code}${link}
<tr><td style="padding:16px 32px;border-top:1px solid ${BLUE_SOFT};font-size:13px;color:#475263">If you did not ask for this, you can ignore this email. Your account has not changed.<br><a href="${esc(origin)}/" style="color:${BLUE}">${esc(origin.replace(/^https?:\/\//, ""))}</a></td></tr>
</table></td></tr></table></body></html>`;
}

// The link carries no code. A forged Host header could at worst point at a page that still
// needs the code, and siteOrigin() prefers the configured PUBLIC_SITE_URL anyway.
export function renderCode(m: CodeMessage): RenderedMail {
  const origin = trimOrigin(m.origin);
  const reset = m.purpose === "PASSWORD_RESET";
  const heading = reset ? "Reset your password" : "Confirm your new email";
  const intro = reset
    ? `Hello ${m.name}, use this code to set a new password for your CK Coaching Group account.`
    : `Hello ${m.name}, use this code to confirm ${m.to} as the email for your CK Coaching Group account.`;
  const expiry = `The code works once and expires in ${m.minutes} minutes.`;
  const link = reset
    ? { href: `${origin}/reset-password?email=${encodeURIComponent(m.to)}`, label: "Enter the code" }
    : { href: `${origin}/account`, label: "Open your account" };
  return {
    subject: reset ? "Your CCG password reset code" : "Confirm your new CCG email",
    text: [heading, "", intro, "", `Code: ${m.code}`, expiry, "", link.href, "", "If you did not ask for this, ignore this email."].join("\n"),
    html: brandedHtml({ origin, heading, lines: [intro, expiry], code: m.code, link }),
  };
}

export function renderEmailChanged(m: EmailChangedMessage): RenderedMail {
  const origin = trimOrigin(m.origin);
  const lines = [
    `Hello ${m.name}, the email for your CK Coaching Group account was changed to ${m.newEmail}.`,
    "Sign-in now uses the new address. If you did not make this change, contact us straight away.",
  ];
  const link = { href: `${origin}/contact`, label: "Contact us" };
  return {
    subject: "Your CCG account email was changed",
    text: ["Your account email was changed", "", ...lines, "", link.href].join("\n"),
    html: brandedHtml({ origin, heading: "Your account email was changed", lines, link }),
  };
}

export function createResendMailer(opts: { apiKey: string; from: string; to: string }): Mailer {
  const resend = new Resend(opts.apiKey);

  function sendRendered(to: string, mail: RenderedMail): Promise<MailResult> {
    const send = resend.emails
      .send({ from: opts.from, to, subject: mail.subject, text: mail.text, html: mail.html })
      .then(({ error }): MailResult => (error ? { status: "FAILED", reason: error.message } : { status: "SENT" }));
    return withTimeout(send);
  }

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
    sendCode(message) {
      return sendRendered(message.to, renderCode(message));
    },
    sendEmailChanged(message) {
      return sendRendered(message.to, renderEmailChanged(message));
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
    async sendCode(message) {
      // A live code in a production log is a credential in the log. Only dev prints it.
      const shown = process.env.NODE_ENV === "production" ? { ...message, code: "******" } : message;
      console.info(`[mailer:dev] ${message.purpose} code to ${message.to}\n${renderCode(shown).text}`);
      return { status: "SENT" };
    },
    async sendEmailChanged(message) {
      console.info(`[mailer:dev] email-changed notice to ${message.to}\n${renderEmailChanged(message).text}`);
      return { status: "SENT" };
    },
  };
}
