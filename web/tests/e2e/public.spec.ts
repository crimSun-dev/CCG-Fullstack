import { expect, test } from "@playwright/test";

// Phase 2: the public read path, checked as raw HTML before any client bundle runs.

test("test_group_coaching_html_contains_capacity", async ({ request }) => {
  const res = await request.get("/programs/group-coaching");
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain("Maximum 20 persons");
  expect(html).toContain("4 sessions");
  expect(html).not.toContain("USD");
  expect(html).not.toContain("1,200");
});

test("test_internship_path_is_404", async ({ page }) => {
  for (const path of ["/programs/internship", "/programs/camp", "/programs/kenity", "/programs/university"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(404);
    await expect(page.locator("main")).not.toContainText(/internship|camp|kenity|university/i);
  }
  for (const path of ["/internship", "/camp", "/kenity", "/university"]) {
    expect((await page.goto(path))?.status(), path).toBe(404);
  }
});

test("test_home_html_has_founder_and_wordmark", async ({ request }) => {
  const html = await (await request.get("/")).text();
  expect(html).toContain("CK Song");
  expect(html).toContain("CK Coaching Group");
  expect(html).toContain('alt="CK Coaching Group"');
});

test("test_philosophy_page_has_vision_and_logo_line", async ({ request }) => {
  const html = await (await request.get("/philosophy")).text();
  expect(html).toContain("Our vision is to unlock the potential");
  expect(html).toContain("Our mission is to grow by growing others");
  expect(html).toContain("CK Coaching Group");
  expect(html).not.toContain("dolor sit amet");
});

test("test_contact_page_has_no_bank_account", async ({ page }) => {
  await page.goto("/contact");
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(/mandiri/i);
  expect(text).not.toMatch(/\b\d[\d\s-]{9,}\d\b/); // account-number shaped run of 10+ digits
  await expect(page.locator("address")).toContainText("Jalur Sutera Boulevard Kav. 28A");
});

test("team page omits the unconfirmed title and stores no card contact", async ({ request }) => {
  const html = await (await request.get("/team")).text();
  expect(html).toContain("Erry Sunarli");
  expect(html).not.toContain("GM Indonesia");
  expect(html).not.toContain("Director | Executive Coach");
  expect(html).not.toContain("kmk.co.id");
  expect(html).toContain("GM Korea");
});

test("why page has the seven deck pressures and cited stats", async ({ page }) => {
  await page.goto("/why");
  await expect(page.locator("ol > li")).toHaveCount(7);
  await expect(page.locator("main")).toContainText("PwC, 27th Annual Global CEO Survey, Asia Pacific");
});

for (const path of ["/", "/contact"]) {
  test(`no horizontal overflow at phone width on ${path} @narrow`, async ({ page }) => {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
