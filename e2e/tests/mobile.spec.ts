import { expect, test } from "../fixtures";
import { expectNoConsoleErrors, recordTake, signUpAndOnboard, watchConsole } from "../helpers";

test("mobile smoke: marketing home, pricing, home and practice with no horizontal scroll", async ({ page }) => {
  const c = watchConsole(page);
  const noHScroll = async (label: string) => {
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over, `${label} overflows horizontally`).toBeLessThanOrEqual(1);
  };
  await page.goto("/");
  await expect(page.locator("h1").first()).toBeVisible();
  await noHScroll("/");
  await page.goto("/pricing");
  await noHScroll("/pricing");

  await signUpAndOnboard(page);
  await noHScroll("/home");
  await page.goto("/practice");
  await noHScroll("/practice");
  const assess = page.waitForResponse((r) => r.url().includes("/api/assess"));
  await recordTake(page);
  expect((await assess).status()).toBe(200);
  await expect(page.locator('[aria-label*="out of 100"]').first()).toBeVisible({ timeout: 20_000 });
  await noHScroll("/practice result");
  await expectNoConsoleErrors(c.errors);
});

test("forms have labelled fields", async ({ page }) => {
  for (const p of ["/sign-in", "/sign-up", "/forgot-password"]) {
    await page.goto(p);
    for (const input of await page.locator("input:visible").all()) {
      const id = await input.getAttribute("id");
      const labelled = (await input.getAttribute("aria-label")) || (id && (await page.locator(`label[for="${id}"]`).count()));
      expect(labelled, `${p} input ${id}`).toBeTruthy();
    }
  }
});
