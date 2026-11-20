import { expect, test } from "../fixtures";
import { mock, PASSWORD, signIn, signUp, signUpAndOnboard, uniqueEmail, finishOnboarding } from "../helpers";

test("sign up, onboarding, home, sign out, sign in", async ({ page }) => {
  const { email } = await signUp(page, { name: "Ada" });
  await expect(page.getByRole("heading", { name: /Welcome, Ada/ })).toBeVisible();
  await finishOnboarding(page);
  await expect(page).toHaveURL(/\/home/);
  await expect(page.locator("body")).toContainText(/Ada|today|plan/i);

  await page.goto("/account");
  await page.getByRole("button", { name: /sign out|log out/i }).first().click();
  await page.waitForURL((u) => !/\/(account|home)/.test(u.pathname));
  await page.goto("/home");
  await expect(page).toHaveURL(/\/sign-in/);

  await signIn(page, email);
  await expect(page).toHaveURL(/\/home/);
});

test("wrong password shows an error", async ({ page }) => {
  await signUpAndOnboard(page);
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel(/email/i).fill(uniqueEmail("nobody"));
  await page.getByLabel(/password/i).fill("not-the-password-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in/);
});

test("forgot and reset password through the captured email", async ({ page, request }) => {
  const { email } = await signUp(page);
  await finishOnboarding(page);
  await page.context().clearCookies();

  await page.goto("/forgot-password");
  await page.getByLabel(/email/i).fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.locator("body")).toContainText(/check your email|sent|link/i);

  let link = "";
  await expect
    .poll(async () => {
      const mails = (await mock(request, "/__mock/emails")) as { to: string; text: string }[];
      const m = mails.filter((x) => x.to === email).pop();
      link = m?.text.match(/https?:\/\/\S+reset-password\S*/)?.[0] ?? "";
      return link;
    })
    .not.toBe("");

  await page.goto(link);
  const next = "a-brand-new-password-2";
  await page.getByLabel(/password/i).fill(next);
  await page.getByRole("button", { name: "Save new password" }).click();
  await page.waitForURL(/\/sign-in/);
  await signIn(page, email, next);
  await expect(page).toHaveURL(/\/home/);
  void PASSWORD;
});

test("invalid reset link is refused", async ({ page }) => {
  await page.goto("/reset-password");
  await expect(page.locator("body")).toContainText(/not valid/i);
});

test("sign-in attempts are rate limited per IP", async ({ page }) => {
  await page.goto("/sign-in");
  const statuses: number[] = [];
  for (let i = 0; i < 33; i++) {
    const r = await page.request.post("/api/auth/sign-in/email", { data: { email: uniqueEmail("rl"), password: "wrong-password-1" } });
    statuses.push(r.status());
  }
  expect(statuses).toContain(429);
});
