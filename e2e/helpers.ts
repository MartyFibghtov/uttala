import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const MOCK = "http://127.0.0.1:12111";
export const PASSWORD = "correct-horse-battery-1";

export const uniqueEmail = (tag = "u") => `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`;

/** Collect console errors and uncaught page errors; call `.errors` after navigating. */
export function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // Missing optional resources are not app bugs.
    if (/favicon|Failed to load resource.*(404)/i.test(t)) return;
    errors.push(`console: ${t}`);
  });
  return { errors };
}

export async function mock(request: APIRequestContext, path: string, init?: { method?: string; data?: unknown }) {
  const res = await request.fetch(`${MOCK}${path}`, { method: init?.method ?? "GET", data: init?.data });
  return res.json();
}

export async function signUp(page: Page, opts?: { name?: string; email?: string; password?: string }) {
  const email = opts?.email ?? uniqueEmail();
  const password = opts?.password ?? PASSWORD;
  await page.goto("/sign-up");
  await page.getByLabel(/name/i).fill(opts?.name ?? "Tester");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/onboarding/);
  return { email, password };
}

/** Click through the onboarding (using the sample scan for the three recorded steps) until /home. */
export async function finishOnboarding(page: Page) {
  for (let i = 0; i < 25 && !/\/home/.test(page.url()); i++) {
    const sample = page.getByRole("button", { name: /Use sample scan/ });
    const next = page.getByRole("button", {
      name: /^(Continue|Start\b|Next:|See my|See what|How scoring)/,
    });
    const target = (await sample.count()) ? sample : next;
    await target.first().click({ timeout: 4000 }).catch(() => undefined);
    await page.waitForTimeout(200);
  }
  await page.waitForURL(/\/home/);
}

export async function signUpAndOnboard(page: Page, opts?: { name?: string }) {
  const creds = await signUp(page, opts);
  await finishOnboarding(page);
  return creds;
}

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/sign-in");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/home/);
}

/** Record with the fake microphone for ~2 s and wait for the scored result. */
export async function recordTake(page: Page, ms = 2200) {
  await page.getByRole("button", { name: /^(Record|Try again)$/ }).click();
  await page.waitForTimeout(ms);
  await page.getByRole("button", { name: "Stop" }).click();
}

export async function expectNoConsoleErrors(errors: string[]) {
  expect(errors, errors.join("\n")).toEqual([]);
}
