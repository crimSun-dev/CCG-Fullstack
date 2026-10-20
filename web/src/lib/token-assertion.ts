import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { isStaffRole, type AdminUser } from "./session-service";

// The hand-off to CK Virtual Lab. CCG signs who the staff member is; the lab checks the signature
// with the same secret and never sees a password or touches this database (and CCG never touches its).
//
// Wire format: base64url(JSON payload) + "." + base64url(HMAC-SHA256(secret, first part)).
// The lab must check, in order: signature (constant time), iss, aud, v, exp, then refuse a seen jti.

export const LAB_ASSERTION_TTL_SECONDS = 60;
export const LAB_ISSUER = "ccg";
export const LAB_AUDIENCE = "ck-virtual-lab";

export type LabAssertion = {
  v: 1;
  iss: typeof LAB_ISSUER;
  aud: typeof LAB_AUDIENCE;
  sub: string; // CCG account id: stable across an email change
  email: string;
  name: string;
  role: "ADMIN" | "EDITOR" | "STAFF";
  // Absolute URL of the account's profile picture on this site, or null. The lab stores it on every
  // entry and shows it on the "You" chip and the account's notes (lab migration 013).
  avatar: string | null;
  iat: number;
  exp: number;
  jti: string; // single use, so a token copied out of a browser history cannot be replayed
};

function sign(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

// Null for a MEMBER: only staff roles may enter the lab.
export function issueLabAssertion(
  user: AdminUser,
  secret: string,
  nowMs = Date.now(),
  avatar: string | null = null,
): string | null {
  if (!isStaffRole(user.role)) return null;
  const iat = Math.floor(nowMs / 1000);
  const payload: LabAssertion = {
    v: 1,
    iss: LAB_ISSUER,
    aud: LAB_AUDIENCE,
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role as LabAssertion["role"],
    avatar,
    iat,
    exp: iat + LAB_ASSERTION_TTL_SECONDS,
    jti: randomUUID(),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(secret, body)}`;
}

// The reference check the lab mirrors. Replay (jti) tracking is the receiver's job.
export function verifyLabAssertion(token: string, secret: string, nowMs = Date.now()): LabAssertion | null {
  const [body, mac, extra] = token.split(".");
  if (!body || !mac || extra !== undefined) return null;
  const expected = Buffer.from(sign(secret, body));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  let claims: LabAssertion;
  try {
    claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (claims.v !== 1 || claims.iss !== LAB_ISSUER || claims.aud !== LAB_AUDIENCE) return null;
  if (!isStaffRole(claims.role) || typeof claims.exp !== "number" || claims.exp * 1000 <= nowMs) return null;
  return claims;
}

// Where the browser goes. The fragment keeps the token out of server logs and Referer headers.
export function labEntryUrl(labUrl: string, token: string): string {
  const url = new URL(labUrl);
  url.hash = `ccg=${token}`;
  return url.toString();
}

// Clearing STAFF tells the lab to drop the account and everything it made there (lab migration 014).
// Signed for its own audience, so it is never accepted as a way in, and a hand-off is never a removal.
export const LAB_REMOVE_AUDIENCE = "ck-virtual-lab:remove";

export type LabRemoval = {
  v: 1;
  iss: typeof LAB_ISSUER;
  aud: typeof LAB_REMOVE_AUDIENCE;
  sub: string; // the CCG account id the lab's name was claimed with
  iat: number;
  exp: number;
  jti: string;
};

export function issueLabRemoval(accountId: string, secret: string, nowMs = Date.now()): string {
  const iat = Math.floor(nowMs / 1000);
  const payload: LabRemoval = {
    v: 1,
    iss: LAB_ISSUER,
    aud: LAB_REMOVE_AUDIENCE,
    sub: accountId,
    iat,
    exp: iat + LAB_ASSERTION_TTL_SECONDS,
    jti: randomUUID(),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(secret, body)}`;
}
