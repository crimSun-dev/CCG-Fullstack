import { expect, test, type Page } from "@playwright/test";
import { EDITOR, prisma } from "./fixtures";

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EDITOR.email);
  await page.getByLabel("Password").fill(EDITOR.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("a logged-out request to /admin redirects to login", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login$/);
});

test("wrong password is 401", async ({ request }) => {
  const res = await request.post("/login", {
    form: { email: EDITOR.email, password: "not the password" },
    maxRedirects: 0,
  });
  expect(res.status()).toBe(401);
});

// The e2e server runs without GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET.
test("without a Google client the password form works and Google is marked unavailable", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("Google sign-in is unavailable")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeDisabled();
  await login(page);
});

test("the Google start route sends nothing to Google when unconfigured", async ({ request }) => {
  for (const path of ["/login/google", "/login/google/callback?code=x&state=y"]) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status()).toBe(303);
    expect(new URL(res.headers()["location"]).pathname).toBe("/login");
  }
});

test("session cookie is httpOnly and SameSite=Lax", async ({ page, context }) => {
  await login(page);
  const cookie = (await context.cookies()).find((c) => c.name === "ccg_session");
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");
});

test("test_revoked_session_cannot_open_admin", async ({ page, context, browser }) => {
  await login(page);
  const oldCookie = (await context.cookies()).find((c) => c.name === "ccg_session");
  expect(oldCookie).toBeDefined();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  // Replay the old cookie in a fresh context: the row is revoked, so it must not open /admin.
  const replay = await browser.newContext();
  await replay.addCookies([oldCookie!]);
  const replayPage = await replay.newPage();
  await replayPage.goto("http://localhost:3200/admin");
  await expect(replayPage).toHaveURL(/\/login$/);
  await replay.close();
});

test("an editor's summary change shows on the public page after revalidation", async ({ page }) => {
  const original = (await prisma.program.findUniqueOrThrow({ where: { code: "group-coaching" } })).summary;
  const edited = `Edited by e2e at ${Date.now()}.`;
  try {
    await login(page);
    const form = page.locator('form[action="/admin/programs/group-coaching"]');
    await form.getByLabel("Summary").fill(edited);
    await form.getByRole("button").click();
    await expect(page.getByRole("status")).toContainText("Saved group-coaching");

    await page.goto("/programs/group-coaching");
    await expect(page.locator("main")).toContainText(edited);
  } finally {
    await prisma.program.update({ where: { code: "group-coaching" }, data: { summary: original } });
  }
});

test("test_editor_cannot_insert_program (route half: no admin route accepts a new code)", async ({ page }) => {
  await login(page);
  const res = await page.request.post("/admin/programs/internship", { form: { summary: "x" }, maxRedirects: 0 });
  expect(res.status()).toBe(404);
  expect(await prisma.program.count()).toBe(3);
});
