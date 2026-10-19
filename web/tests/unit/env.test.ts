import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

const base = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://u:p@ep-public.neon.tech/ccg_public",
  LEAD_TO_EMAIL: "gm@example.com",
  LEAD_IP_SALT: "a-long-enough-salt-value",
} as NodeJS.ProcessEnv;

describe("parseEnv", () => {
  it("accepts a complete environment", () => {
    expect(parseEnv(base).LEAD_TO_EMAIL).toBe("gm@example.com");
  });

  it("refuses to start without LEAD_TO_EMAIL or DATABASE_URL", () => {
    expect(() => parseEnv({ ...base, LEAD_TO_EMAIL: undefined })).toThrow(/LEAD_TO_EMAIL/);
    expect(() => parseEnv({ ...base, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });

  it("refuses the office hub database host", () => {
    expect(() => parseEnv({ ...base, HUB_DATABASE_HOST: "ep-public.neon.tech" })).toThrow(/office hub/);
  });

  it("requires a Resend key on the production deployment only", () => {
    expect(() => parseEnv({ ...base, NODE_ENV: "production", VERCEL_ENV: "production" })).toThrow(/RESEND_API_KEY/);
    expect(parseEnv({ ...base, NODE_ENV: "production", VERCEL_ENV: "preview" }).RESEND_API_KEY).toBeUndefined();
  });
});
