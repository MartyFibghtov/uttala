import { expect, test } from "../fixtures";
import { expectNoConsoleErrors, watchConsole } from "../helpers";

const PAGES: [string, RegExp][] = [
  ["/", /SayClear/i],
  ["/features", /./],
  ["/method", /./],
  ["/pricing", /Plus/],
  ["/help", /./],
  ["/languages", /./],
  ["/languages/swedish", /Swedish/],
  ["/languages/spanish", /Spanish/],
  ["/privacy", /privacy/i],
  ["/terms", /terms/i],
];

for (const [path, text] of PAGES) {
  test(`marketing page ${path} renders without console errors`, async ({ page }) => {
    const c = watchConsole(page);
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.locator("body")).toContainText(text);
    await expect(page).toHaveTitle(/.+/);
    await page.waitForLoadState("networkidle");
    await expectNoConsoleErrors(c.errors);
  });
}

test("404 page", async ({ page }) => {
  const res = await page.goto("/definitely-not-a-page");
  expect(res?.status()).toBe(404);
  await expect(page.locator("body")).toContainText(/does not exist|not found/i);
});

test("robots.txt and sitemap.xml are valid", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  const rt = await robots.text();
  expect(rt).toMatch(/User-agent/i);
  expect(rt).toMatch(/Sitemap: http/i);
  expect(rt).toMatch(/Disallow: \/(api|account|home)/);

  const sm = await request.get("/sitemap.xml");
  expect(sm.status()).toBe(200);
  const xml = await sm.text();
  expect(xml).toMatch(/<urlset/);
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(locs.length).toBeGreaterThan(10);
  for (const l of locs) expect(l).toMatch(/^https?:\/\//);
  expect(new Set(locs).size).toBe(locs.length);
  expect(locs.some((l) => l.endsWith("/pricing"))).toBe(true);
  // A sample of listed URLs must resolve.
  for (const l of locs.slice(0, 12)) {
    const r = await request.get(new URL(l).pathname);
    expect(r.status(), l).toBe(200);
  }
});

test("signed-out visitors are redirected from app routes", async ({ page }) => {
  for (const p of ["/home", "/practice", "/drills", "/account", "/progress", "/learn", "/onboarding"]) {
    await page.goto(p);
    await expect(page, p).toHaveURL(/\/sign-in/);
  }
});

test("pricing page shows honest trial and plan copy", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByText(/7-day free trial/i).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Monthly" })).toBeVisible();
});
