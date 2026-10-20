import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { parseEnv } from "@/lib/env";
import { removeFromLab } from "@/lib/lab-removal";
import { issueLabRemoval, LAB_AUDIENCE, LAB_REMOVE_AUDIENCE } from "@/lib/token-assertion";

const SECRET = "s".repeat(40);
const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const base = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://u:p@ep-public.neon.tech/ccg_public",
  LEAD_TO_EMAIL: "gm@example.com",
  LEAD_IP_SALT: "a-long-enough-salt-value",
} as NodeJS.ProcessEnv;
const embedded = parseEnv({ ...base, LAB_ASSERTION_SECRET: SECRET, LAB_DATABASE_URL: "postgresql://lab/db" });
const external = parseEnv({ ...base, LAB_ASSERTION_SECRET: SECRET, LAB_URL: "https://lab.example/office/" });

const claimsOf = (token: string) => {
  const [body, mac] = token.split(".");
  expect(mac).toBe(createHmac("sha256", SECRET).update(body).digest("base64url"));
  return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
};

describe("issueLabRemoval", () => {
  it("signs a short-lived, single-use notice for its own audience, never the sign-in one", () => {
    const now = Date.UTC(2026, 9, 20, 3, 0, 0);
    const claims = claimsOf(issueLabRemoval(ACCOUNT, SECRET, now));
    expect(claims).toMatchObject({ v: 1, iss: "ccg", aud: LAB_REMOVE_AUDIENCE, sub: ACCOUNT, iat: now / 1000, exp: now / 1000 + 60 });
    expect(claims.aud).not.toBe(LAB_AUDIENCE);
    expect(claims.jti).toMatch(/^[0-9a-f-]{36}$/);
    expect(claimsOf(issueLabRemoval(ACCOUNT, SECRET, now)).jti).not.toBe(claims.jti);
  });
});

describe("removeFromLab", () => {
  it("skips when no lab is configured", async () => {
    const post = vi.fn();
    expect(await removeFromLab(ACCOUNT, parseEnv(base), { post })).toBe("skipped");
    expect(post).not.toHaveBeenCalled();
  });

  it("posts the notice to the embedded lab", async () => {
    const post = vi.fn(async () => 200);
    expect(await removeFromLab(ACCOUNT, embedded, { post })).toBe("removed");
    const [path, body] = post.mock.calls[0] as unknown as [string, { token: string }];
    expect(path).toBe("/v1/ccg/remove");
    expect(claimsOf(body.token).sub).toBe(ACCOUNT);
  });

  it("posts beside LAB_URL's page for an external lab", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    expect(await removeFromLab(ACCOUNT, external, { fetch: fetch as unknown as typeof globalThis.fetch })).toBe("removed");
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe("https://lab.example/office/v1/ccg/remove");
    expect(init.method).toBe("POST");
    expect(claimsOf(JSON.parse(String(init.body)).token).sub).toBe(ACCOUNT);
  });

  it("reports failure when the lab refuses, errors, or cannot start", async () => {
    expect(await removeFromLab(ACCOUNT, embedded, { post: async () => 401 })).toBe("failed");
    expect(await removeFromLab(ACCOUNT, embedded, { post: async () => Promise.reject(new Error("no lab")) })).toBe("failed");
    const down = (async () => new Response("", { status: 503 })) as unknown as typeof globalThis.fetch;
    expect(await removeFromLab(ACCOUNT, external, { fetch: down })).toBe("failed");
    const offline = (async () => Promise.reject(new TypeError("fetch failed"))) as unknown as typeof globalThis.fetch;
    expect(await removeFromLab(ACCOUNT, external, { fetch: offline })).toBe("failed");
  });
});
