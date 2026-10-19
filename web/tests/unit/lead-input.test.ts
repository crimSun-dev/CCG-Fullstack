import { describe, expect, it } from "vitest";
import { hashIp, judgeLeadInput } from "@/lib/lead-service";

const valid = { name: "Budi", email: "budi@example.com", interest: "group-coaching", consent: true };

describe("judgeLeadInput", () => {
  it("accepts a minimal valid lead", () => {
    expect(judgeLeadInput(valid)).toMatchObject({ kind: "ok" });
  });

  it("requires consent === true, not a truthy string", () => {
    expect(judgeLeadInput({ ...valid, consent: undefined })).toEqual({ kind: "no_consent" });
    expect(judgeLeadInput({ ...valid, consent: "true" })).toEqual({ kind: "no_consent" });
  });

  it("rejects withheld interests before any query", () => {
    for (const interest of ["internship", "camp", "university", "kenity", ""]) {
      expect(judgeLeadInput({ ...valid, interest })).toEqual({ kind: "invalid" });
    }
    expect(judgeLeadInput({ ...valid, interest: "general" })).toMatchObject({ kind: "ok" });
  });

  it("enforces field limits", () => {
    expect(judgeLeadInput({ ...valid, name: "" })).toEqual({ kind: "invalid" });
    expect(judgeLeadInput({ ...valid, name: "x".repeat(121) })).toEqual({ kind: "invalid" });
    expect(judgeLeadInput({ ...valid, email: "a@b@c" })).toEqual({ kind: "invalid" });
    expect(judgeLeadInput({ ...valid, email: "no-at-sign" })).toEqual({ kind: "invalid" });
    expect(judgeLeadInput({ ...valid, phone: "1".repeat(41) })).toEqual({ kind: "invalid" });
    expect(judgeLeadInput({ ...valid, message: "m".repeat(2001) })).toEqual({ kind: "invalid" });
  });

  it("counts a 120-character non-Latin name by characters, not UTF-16 units", () => {
    const name = "김".repeat(60) + "𝓐".repeat(60);
    expect(judgeLeadInput({ ...valid, name })).toMatchObject({ kind: "ok" });
  });

  it("treats a filled honeypot as a bot before checking anything else", () => {
    expect(judgeLeadInput({ companyWebsite: "http://spam.example" })).toEqual({ kind: "honeypot" });
  });

  it("rejects non-objects", () => {
    expect(judgeLeadInput(null)).toEqual({ kind: "invalid" });
    expect(judgeLeadInput("lead")).toEqual({ kind: "invalid" });
  });
});

describe("hashIp", () => {
  it("is salted SHA-256 and never the raw IP", () => {
    const h = hashIp("203.0.113.7", "salt-a-long-enough-value");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("203.0.113.7");
    expect(hashIp("203.0.113.7", "another-salt-value-here")).not.toBe(h);
  });
});
