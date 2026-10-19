import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { labTarget, parseEnv } from "@/lib/env";
import { labRoot, scopeCookie, withLabBase } from "@/lib/lab-bridge";

const base = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://u:p@ep-public.neon.tech/ccg_public",
  LEAD_TO_EMAIL: "gm@example.com",
  LEAD_IP_SALT: "a-long-enough-salt-value",
} as NodeJS.ProcessEnv;
const SECRET = "s".repeat(40);

describe("where the lab button goes", () => {
  it("nowhere without the hand-off secret", () => {
    expect(labTarget(parseEnv({ ...base, LAB_DATABASE_URL: "postgresql://lab/db" }))).toBeNull();
  });
  it("to this site's /lab when the lab's database is set", () => {
    expect(labTarget(parseEnv({ ...base, LAB_ASSERTION_SECRET: SECRET, LAB_DATABASE_URL: "postgresql://lab/db" }))).toBe("embedded");
  });
  it("to LAB_URL when set, ahead of the embedded lab", () => {
    const e = parseEnv({ ...base, LAB_ASSERTION_SECRET: SECRET, LAB_DATABASE_URL: "postgresql://lab/db", LAB_URL: "https://lab.example/" });
    expect(labTarget(e)).toBe("external");
  });
  it("refuses the site's own database as the lab's, and defaults the company to kmk", () => {
    expect(() => parseEnv({ ...base, LAB_DATABASE_URL: base.DATABASE_URL })).toThrow(/LAB_DATABASE_URL/);
    expect(parseEnv(base).LAB_COMPANY_SLUG).toBe("kmk");
  });
});

describe("lab bridge", () => {
  it("scopes the lab's session cookie to /lab, setting and clearing alike", () => {
    expect(scopeCookie("lab_session=abc; Path=/; HttpOnly; SameSite=Lax; Max-Age=36000; Secure")).toBe(
      "lab_session=abc; Path=/lab; HttpOnly; SameSite=Lax; Max-Age=36000; Secure",
    );
    expect(scopeCookie("lab_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0")).toBe(
      "lab_session=; Path=/lab; HttpOnly; SameSite=Lax; Max-Age=0",
    );
    expect(scopeCookie("other=1; Path=/elsewhere")).toBe("other=1; Path=/elsewhere");
  });

  it("finds the lab beside the standalone server first, then beside web/", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lab-root-"));
    const make = (dir: string) => {
      fs.mkdirSync(path.join(dir, "server", "src"), { recursive: true });
      fs.writeFileSync(path.join(dir, "server", "src", "app.js"), "");
    };
    const web = path.join(tmp, "web");
    fs.mkdirSync(web);
    expect(labRoot(web)).toBeNull();
    make(path.join(tmp, "lab"));
    expect(labRoot(web)).toBe(path.join(tmp, "lab"));
    make(path.join(web, "lab"));
    expect(labRoot(web)).toBe(path.join(web, "lab"));
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("puts the lab's relative URLs under /lab/ with a <base> right after <head>", () => {
    expect(withLabBase('<!doctype html><html lang="en"><head><meta charset="utf-8"></head>')).toBe(
      '<!doctype html><html lang="en"><head><base href="/lab/"><meta charset="utf-8"></head>',
    );
    expect(withLabBase("<head lang=x>x")).toBe('<head lang=x><base href="/lab/">x');
    expect(withLabBase("<p>no head</p>")).toBe('<base href="/lab/"><p>no head</p>');
  });

  it("finds this repo's lab from web/", () => {
    expect(labRoot(process.cwd())).toBe(path.resolve(process.cwd(), "..", "lab"));
  });
});
