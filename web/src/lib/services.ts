import { createContentRepository } from "./content-repository";
import { db } from "./db";
import { env } from "./env";
import { createGoogleOidc, googleConfig, type GoogleOidc } from "./google-oidc";
import { createLeadService, type LeadService } from "./lead-service";
import { createLogMailer, createResendMailer, type Mailer } from "./mailer";
import { createSessionService, type SessionService } from "./session-service";

// Composition root for request handlers. Tests build services directly with their own deps.

export function mailer(): Mailer {
  const e = env();
  return e.RESEND_API_KEY
    ? createResendMailer({ apiKey: e.RESEND_API_KEY, from: e.LEAD_FROM_EMAIL, to: e.LEAD_TO_EMAIL })
    : createLogMailer(e.LEAD_TO_EMAIL);
}

export function leadService(): LeadService {
  return createLeadService({ prisma: db(), mailer: mailer(), ipSalt: env().LEAD_IP_SALT });
}

export function sessionService(): SessionService {
  return createSessionService(db());
}

// Null when GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is unset. Callers show Google as unavailable.
export function googleOidc(): GoogleOidc | null {
  const config = googleConfig(env());
  return config ? createGoogleOidc(config) : null;
}

// Uncached repository, for admin screens that must show the row as it is now.
export function liveContent() {
  return createContentRepository(db());
}
