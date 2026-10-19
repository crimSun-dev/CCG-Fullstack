import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { newCode } from "@/lib/account-service";
import { siteOrigin } from "@/lib/http";
import { renderCode, renderEmailChanged } from "@/lib/mailer";

const reset = { to: "a@b.co", name: "Ada", purpose: "PASSWORD_RESET" as const, code: "042917", minutes: 15, origin: "https://ajarin.org/" };

describe("verification email", () => {
  it("carries the CCG mark, the brand palette and the code", () => {
    const mail = renderCode(reset);
    expect(mail.html).toContain('src="https://ajarin.org/brand/ccg-mark-email.png"');
    for (const colour of ["#030507", "#1088f8", "#3e9ff8", "#70b8f8"]) expect(mail.html).toContain(colour);
    expect(mail.html).toContain("042917");
    expect(mail.text).toContain("Code: 042917");
    expect(mail.text).toContain("15 minutes");
  });

  it("links to the public host, never the bind address, and keeps the code out of the link", () => {
    const mail = renderCode(reset);
    expect(mail.html).not.toContain("0.0.0.0");
    expect(mail.html).toContain('href="https://ajarin.org/reset-password?email=a%40b.co"');
    expect(mail.html).not.toMatch(/href="[^"]*042917/);
  });

  it("escapes a name that contains markup", () => {
    const mail = renderCode({ ...reset, name: '<img src=x onerror="alert(1)">' });
    expect(mail.html).not.toContain("<img src=x");
    expect(mail.html).toContain("&lt;img src=x");
  });

  it("writes the change notice to the old address with the new one named", () => {
    const mail = renderEmailChanged({ to: "old@b.co", name: "Ada", newEmail: "new@b.co", origin: "https://ajarin.org" });
    expect(mail.subject).toMatch(/changed/i);
    expect(mail.html).toContain("new@b.co");
    expect(mail.html).toContain("#1088f8");
  });

  it("makes six-digit codes", () => {
    for (let i = 0; i < 200; i++) expect(newCode()).toMatch(/^\d{6}$/);
  });
});

describe("siteOrigin", () => {
  const behindProxy = new NextRequest("http://0.0.0.0:3000/forgot-password", {
    headers: { host: "0.0.0.0:3000", "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" },
  });

  it("uses PUBLIC_SITE_URL over any request header", () => {
    expect(siteOrigin(behindProxy, "https://ajarin.org/some/path")).toBe("https://ajarin.org");
  });

  it("falls back to the forwarded host, not the bind address", () => {
    const req = new NextRequest("http://0.0.0.0:3000/x", { headers: { host: "ajarin.org", "x-forwarded-proto": "https" } });
    expect(siteOrigin(req, undefined)).toBe("https://ajarin.org");
  });
});
