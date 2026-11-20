import { createHmac } from "node:crypto";
import { expect, test } from "../fixtures";
import { expectNoConsoleErrors, signUpAndOnboard, watchConsole } from "../helpers";

test("public sound library pages render", async ({ page }) => {
  const c = watchConsole(page);
  let res = await page.goto("/languages/swedish/sounds");
  expect(res?.status()).toBe(200);
  await expect(page.locator("h1").first()).toBeVisible();
  const href = await page.locator('a[href^="/languages/swedish/sounds/"]').first().getAttribute("href");
  expect(href).toBeTruthy();
  res = await page.goto(href!);
  expect(res?.status()).toBe(200);
  await expect(page.locator("h1").first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expectNoConsoleErrors(c.errors);
  // Unknown slug: a not-found page that search engines are told to ignore (status is 404, or 200 on a cold streamed render).
  await page.goto("/languages/swedish/sounds/nope-nope");
  await expect(page.locator("body")).toContainText(/does not exist/);
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
});

test("generated images and icons", async ({ request, page }) => {
  const og = await request.get("/opengraph-image");
  expect(og.status()).toBe(200);
  expect(og.headers()["content-type"]).toMatch(/image\/png/);
  const icon = await request.get("/icons/192");
  expect(icon.status()).toBe(200);
  expect(icon.headers()["content-type"]).toMatch(/image\//);
  await page.goto("/languages/swedish");
  const og2 = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(og2).toBeTruthy();
  const lang = await request.get(new URL(og2!).pathname + new URL(og2!).search);
  expect(lang.status()).toBe(200);
  expect(lang.headers()["content-type"]).toMatch(/image\/png/);
});

test("health endpoint", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(res.headers()["cache-control"]).toMatch(/no-store/);
});

test("auth pages are noindex, marketing pages are not", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await page.goto("/pricing");
  const robots = page.locator('meta[name="robots"]');
  if (await robots.count()) await expect(robots.first()).not.toHaveAttribute("content", /noindex/);
});

test("security headers and CSP are present", async ({ request }) => {
  const res = await request.get("/pricing");
  const h = res.headers();
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["content-security-policy"]).toBeTruthy();
});

test("unsubscribe: GET only asks, POST acts, bad token is refused", async ({ page, request }) => {
  await signUpAndOnboard(page);
  const me = await (await page.request.get("/api/me")).json();
  const userId: string = me.user.id;
  const token = createHmac("sha256", "e2e-secret-e2e-secret-e2e-secret-0123456789").update(`unsubscribe:${userId}`).digest("hex");
  const url = `/api/unsubscribe?u=${encodeURIComponent(userId)}&t=${token}`;

  const get = await request.get(url);
  expect(get.status()).toBe(200);
  expect(await get.text()).toMatch(/Stop reminders/);

  const bad = await request.post(`/api/unsubscribe?u=${encodeURIComponent(userId)}&t=deadbeef`);
  expect(bad.status()).toBe(400);

  const ok = await request.post(url);
  expect(ok.status()).toBe(200);
  expect(await ok.text()).toMatch(/Reminders are off/);
});

test("data export returns the learner's data as JSON", async ({ page, request }) => {
  const { email } = await signUpAndOnboard(page, { name: "Exporter" });
  expect((await request.get("/api/me/export")).status()).toBe(401);
  const res = await page.request.get("/api/me/export");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-disposition"] ?? "").toMatch(/attachment/);
  const body = JSON.stringify(await res.json());
  expect(body).toContain(email);
});

test("cron reminders need the secret", async ({ request }) => {
  expect((await request.get("/api/cron/reminders")).status()).toBe(401);
  const ok = await request.get("/api/cron/reminders", { headers: { authorization: "Bearer e2e-cron" } });
  expect(ok.status()).toBe(200);
});
