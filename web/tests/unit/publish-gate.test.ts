import { describe, expect, it, vi } from "vitest";

// If the gate ever touched the database, importing it would load this mock and throw.
vi.mock("@/lib/db", () => {
  throw new Error("PublishGate must not import the database layer");
});

const { assertPublicCode, isPublicPath, OfferNotPublicError, PUBLIC_PROGRAM_CODES } = await import(
  "@/lib/publish-gate"
);

describe("PublishGate", () => {
  it("test_assert_public_code_accepts_group_coaching", () => {
    expect(assertPublicCode("group-coaching")).toBe("group-coaching");
  });

  it("test_assert_public_code_rejects_internship", () => {
    expect(() => assertPublicCode("internship")).toThrow(OfferNotPublicError);
    for (const withheld of ["camp", "university", "kenity"]) {
      expect(() => assertPublicCode(withheld)).toThrow(OfferNotPublicError);
    }
  });

  it("test_assert_public_code_rejects_empty_and_uppercase", () => {
    expect(() => assertPublicCode("")).toThrow(OfferNotPublicError);
    expect(() => assertPublicCode("Group-Coaching")).toThrow(OfferNotPublicError);
    expect(() => assertPublicCode(" group-coaching")).toThrow(OfferNotPublicError);
  });

  it("isPublicPath is the boolean form over exactly three codes", () => {
    expect(PUBLIC_PROGRAM_CODES).toEqual(["leadership-advisory", "group-coaching", "premium-coaching"]);
    expect(isPublicPath("premium-coaching")).toBe(true);
    expect(isPublicPath("internship")).toBe(false);
  });

  it("error carries the stable code and slug", () => {
    expect(() => assertPublicCode("camp")).toThrow(expect.objectContaining({ code: "OFFER_NOT_PUBLIC", slug: "camp" }));
  });
});
