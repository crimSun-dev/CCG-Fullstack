import { describe, expect, it } from "vitest";
import type { AdminUser } from "@/lib/session-service";
import { issueLabAssertion, LAB_ASSERTION_TTL_SECONDS, labEntryUrl, verifyLabAssertion } from "@/lib/token-assertion";

const SECRET = "a-shared-secret-of-at-least-32-chars!!";
const NOW = Date.UTC(2026, 9, 19, 12, 0, 0);
const staff: AdminUser = { id: "8d3e1c9a-0000-4000-8000-000000000001", email: "draven@ccg.test", name: "Draven Chen", role: "STAFF" };

const decode = (token: string) => JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));

describe("lab assertion", () => {
  it("carries id, email, full name and role, with a short life and a unique id", () => {
    const token = issueLabAssertion(staff, SECRET, NOW)!;
    const claims = decode(token);
    expect(claims).toMatchObject({
      v: 1,
      iss: "ccg",
      aud: "ck-virtual-lab",
      sub: staff.id,
      email: "draven@ccg.test",
      name: "Draven Chen",
      role: "STAFF",
      iat: NOW / 1000,
      exp: NOW / 1000 + LAB_ASSERTION_TTL_SECONDS,
    });
    expect(claims.jti).toMatch(/^[0-9a-f-]{36}$/);
    expect(decode(issueLabAssertion(staff, SECRET, NOW)!).jti).not.toBe(claims.jti);
  });

  it("never carries a password or hash", () => {
    const token = issueLabAssertion({ ...staff, passwordHash: "$2b$12$secret" } as AdminUser, SECRET, NOW)!;
    expect(Object.keys(decode(token)).sort()).toEqual(["aud", "email", "exp", "iat", "iss", "jti", "name", "role", "sub", "v"]);
    expect(Buffer.from(token.split(".")[0], "base64url").toString()).not.toContain("secret");
  });

  it("is not issued to a MEMBER", () => {
    expect(issueLabAssertion({ ...staff, role: "MEMBER" }, SECRET, NOW)).toBeNull();
  });

  it("verifies with the secret, and fails with another secret, a tampered body, or after expiry", () => {
    const token = issueLabAssertion(staff, SECRET, NOW)!;
    expect(verifyLabAssertion(token, SECRET, NOW + 1000)?.name).toBe("Draven Chen");
    expect(verifyLabAssertion(token, "another-secret-of-at-least-32-chars!!!", NOW)).toBeNull();

    const forged = Buffer.from(JSON.stringify({ ...decode(token), role: "ADMIN" })).toString("base64url");
    expect(verifyLabAssertion(`${forged}.${token.split(".")[1]}`, SECRET, NOW)).toBeNull();
    expect(verifyLabAssertion(`${token}.extra`, SECRET, NOW)).toBeNull();
    expect(verifyLabAssertion(token, SECRET, NOW + LAB_ASSERTION_TTL_SECONDS * 1000)).toBeNull();
  });

  it("puts the token in the fragment, not the query", () => {
    const url = new URL(labEntryUrl("https://lab.example/enter?x=1", "abc.def"));
    expect(url.search).toBe("?x=1");
    expect(url.hash).toBe("#ccg=abc.def");
  });
});
