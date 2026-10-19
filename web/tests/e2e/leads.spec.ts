import { expect, test } from "@playwright/test";
import { freshIp, prisma } from "./fixtures";

// Phase 3 at the HTTP boundary. Service-level rules are covered in tests/db/lead-service.test.ts.

const valid = { name: "Rina Wijaya", email: "rina@example.com", interest: "premium-coaching", consent: true };

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("valid JSON lead returns 202 and stores one row", async ({ request }) => {
  const email = `json-${Date.now()}@example.com`;
  const res = await request.post("/api/v1/leads", {
    data: { ...valid, email },
    headers: { "x-forwarded-for": freshIp() },
  });
  expect(res.status()).toBe(202);
  expect(await prisma.lead.count({ where: { email } })).toBe(1);
});

test("missing consent and withheld interest are 400 with an error body", async ({ request }) => {
  const noConsent = await request.post("/api/v1/leads", {
    data: { ...valid, consent: false },
    headers: { "x-forwarded-for": freshIp() },
  });
  expect(noConsent.status()).toBe(400);
  expect(await noConsent.json()).toEqual({ error: "NO_CONSENT" });

  const internship = await request.post("/api/v1/leads", {
    data: { ...valid, interest: "internship" },
    headers: { "x-forwarded-for": freshIp() },
  });
  expect(internship.status()).toBe(400);
  expect(await internship.json()).toEqual({ error: "INVALID" });
});

test("sixth post from one IP is 429 with Retry-After", async ({ request }) => {
  const ip = freshIp();
  for (let i = 0; i < 5; i++) {
    await request.post("/api/v1/leads", { data: { ...valid, consent: false }, headers: { "x-forwarded-for": ip } });
  }
  const sixth = await request.post("/api/v1/leads", { data: valid, headers: { "x-forwarded-for": ip } });
  expect(sixth.status()).toBe(429);
  expect(sixth.headers()["retry-after"]).toBe("600");
});

test.describe("form without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("plain HTML post saves the lead and shows the receipt", async ({ page }) => {
    const email = `nojs-${Date.now()}@example.com`;
    await page.setExtraHTTPHeaders({ "x-forwarded-for": freshIp() });
    await page.goto("/contact");
    await page.getByLabel("Name").fill("Agus Salim");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel(/I agree/).check();
    await page.getByRole("button", { name: "Send enquiry" }).click();

    await expect(page).toHaveURL(/\/contact\?lead=sent/);
    await expect(page.getByRole("status")).toContainText("We will reply within one business day.");
    expect(await prisma.lead.count({ where: { email } })).toBe(1);
  });
});

test("enhanced form posts JSON and shows the receipt in place", async ({ page }) => {
  const email = `js-${Date.now()}@example.com`;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": freshIp() });
  await page.goto("/contact?interest=group-coaching");
  await expect(page.getByLabel("Interested in")).toHaveValue("group-coaching");
  await page.getByLabel("Name").fill("Lee Ji-eun");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/I agree/).check();
  await page.getByRole("button", { name: "Send enquiry" }).click();

  await expect(page.getByRole("status")).toContainText("We will reply within one business day.");
  await expect(page).toHaveURL(/\/contact\?interest=group-coaching$/);
  const row = await prisma.lead.findFirstOrThrow({ where: { email } });
  expect(row.interest).toBe("group-coaching");
});
