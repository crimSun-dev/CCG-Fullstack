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

  it("reads blank site and lab values as unset, and refuses a short lab secret", () => {
    const blank = parseEnv({ ...base, PUBLIC_SITE_URL: "", LAB_URL: " ", LAB_ASSERTION_SECRET: "" });
    expect([blank.PUBLIC_SITE_URL, blank.LAB_URL, blank.LAB_ASSERTION_SECRET]).toEqual([undefined, undefined, undefined]);
    expect(parseEnv({ ...base, LAB_URL: "https://lab.example" }).LAB_URL).toBe("https://lab.example");
    expect(() => parseEnv({ ...base, LAB_ASSERTION_SECRET: "too-short" })).toThrow(/LAB_ASSERTION_SECRET/);
    expect(() => parseEnv({ ...base, PUBLIC_SITE_URL: "ajarin.org" })).toThrow(/PUBLIC_SITE_URL/);
  });

  it("requires a Resend key on the production deployment only", () => {
    expect(() => parseEnv({ ...base, NODE_ENV: "production", VERCEL_ENV: "production" })).toThrow(/RESEND_API_KEY/);
    expect(parseEnv({ ...base, NODE_ENV: "production", VERCEL_ENV: "preview" }).RESEND_API_KEY).toBeUndefined();
  });
});
