import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { publicUrl, seeOther } from "@/lib/http";

// What the standalone server sees behind Hostinger: req.url is the bind address.
const behindProxy = (headers: Record<string, string>) =>
  new NextRequest("https://0.0.0.0:3000/login/google", { headers });

describe("publicUrl", () => {
  it("uses the proxied host, not the bind address", () => {
    const req = behindProxy({ host: "ajarin.org", "x-forwarded-proto": "https" });
    expect(publicUrl(req, "/login/google/callback").toString()).toBe("https://ajarin.org/login/google/callback");
  });

  it("prefers the first X-Forwarded-Host and X-Forwarded-Proto", () => {
    const req = behindProxy({ host: "0.0.0.0:3000", "x-forwarded-host": "ajarin.org, cdn", "x-forwarded-proto": "https, http" });
    expect(publicUrl(req, "/login").toString()).toBe("https://ajarin.org/login");
  });

  it("keeps the request protocol when no proto header is sent", () => {
    const req = new NextRequest("http://localhost:3200/login", { headers: { host: "localhost:3200" } });
    expect(publicUrl(req, "/account").toString()).toBe("http://localhost:3200/account");
  });

  it("drives the seeOther Location", () => {
    const req = behindProxy({ host: "ajarin.org", "x-forwarded-proto": "https" });
    expect(seeOther(req, "/admin").headers.get("Location")).toBe("https://ajarin.org/admin");
  });
});
