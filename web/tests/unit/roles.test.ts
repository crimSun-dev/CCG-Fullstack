import { describe, expect, it } from "vitest";
import { cleanName, homeForRole, isEmail, isStaffRole, passwordProblem } from "@/lib/session-service";

describe("role policy", () => {
  it("sends staff roles to /admin and a member to /account", () => {
    expect(homeForRole("ADMIN")).toBe("/admin");
    expect(homeForRole("EDITOR")).toBe("/admin");
    expect(homeForRole("STAFF")).toBe("/admin");
    expect(homeForRole("MEMBER")).toBe("/account");
    expect(homeForRole("anything-else")).toBe("/account");
  });

  it("treats ADMIN, EDITOR and STAFF as staff, never MEMBER", () => {
    expect(["ADMIN", "EDITOR", "STAFF", "MEMBER"].map(isStaffRole)).toEqual([true, true, true, false]);
  });
});

describe("account input", () => {
  it("bounds the password to bcrypt's 72 bytes", () => {
    expect(passwordProblem("x".repeat(11))).not.toBeNull();
    expect(passwordProblem("x".repeat(12))).toBeNull();
    expect(passwordProblem("x".repeat(72))).toBeNull();
    expect(passwordProblem("x".repeat(73))).not.toBeNull();
    expect(passwordProblem("é".repeat(37))).not.toBeNull(); // 74 bytes
  });

  it("collapses whitespace in a name and refuses an empty one", () => {
    expect(cleanName("  Draven   Chen ")).toBe("Draven Chen");
    expect(cleanName("   ")).toBeNull();
    expect(cleanName("x".repeat(121))).toBeNull();
  });

  it("accepts an ordinary address and refuses a bare word", () => {
    expect(isEmail("someone@example.com")).toBe(true);
    expect(isEmail("someone")).toBe(false);
    expect(isEmail("a b@example.com")).toBe(false);
  });
});
