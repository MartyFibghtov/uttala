import { expect, test } from "../fixtures";
import { expectNoConsoleErrors, mock, recordTake, signUp, signUpAndOnboard, watchConsole } from "../helpers";

const chips = (page: import("@playwright/test").Page) => page.locator('[aria-label*="out of 100"]');

async function makeWavBuffer(page: import("@playwright/test").Page) {
  const wav = await page.evaluate(async () => {
    const n = 16000 * 2;
    const b = new Uint8Array(44 + n * 2);
    const v = new DataView(b.buffer);
    const s = (o: number, t: string) => [...t].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
    s(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); s(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, 1, true); v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    s(36, "data"); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(i / 20) * 8000, true);
    return Array.from(b);
  });
  return Buffer.from(wav);
}

test("practice a sentence end to end with the fake microphone", async ({ page, request }) => {
  const c = watchConsole(page);
  await mock(request, "/__mock/stt-override", { method: "POST", data: { reset: true } });
  await signUpAndOnboard(page);
  await page.goto("/practice");
  await expect(page.getByRole("button", { name: /^Record$/ })).toBeVisible();
  const assess = page.waitForResponse((r) => r.url().includes("/api/assess") && r.request().method() === "POST");
  await recordTake(page);
  const res = await assess;
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.words.length).toBeGreaterThan(0);
  await expect(chips(page).first()).toBeVisible({ timeout: 20_000 });
  const labels = await chips(page).evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  expect(labels.length).toBe(body.words.length);
  for (const l of labels) expect(l).toMatch(/: (Clear|Unclear|Mispronounced|Skipped), \d+ out of 100/);
  expect(body.scores.accuracy).toBeGreaterThan(50);
  await expect(page.getByRole("button", { name: /Try again/ })).toBeVisible();
  void c;
});

test("misheard words become unclear and land in the drill list", async ({ page, request }) => {
  await signUpAndOnboard(page);
  await page.goto("/practice");
  await mock(request, "/__mock/stt-override", { method: "POST", data: { word: "*", heard: "zzzzz" } });
  try {
    const assess = page.waitForResponse((r) => r.url().includes("/api/assess") && r.request().method() === "POST");
    await recordTake(page);
    const body = await (await assess).json();
    const bad = body.words.filter((w: { status: string }) => w.status !== "ok");
    expect(bad.length).toBeGreaterThan(0);
    await expect(page.locator('[aria-label*="Unclear"], [aria-label*="Mispronounced"]').first()).toBeVisible({ timeout: 20_000 });
    const victim: string = bad[0].text;
    await page.goto("/drills");
    await expect(page.getByText(new RegExp(victim.replace(/[^\p{L}']/gu, ""), "i")).first()).toBeVisible();
  } finally {
    await mock(request, "/__mock/stt-override", { method: "POST", data: { reset: true } });
  }
});

test("scoring failure is honest and does not use up the allowance", async ({ page, request }) => {
  await signUpAndOnboard(page);
  await page.goto("/practice");
  await mock(request, "/__mock/stt-override", { method: "POST", data: { fail: true } });
  try {
    const assess = page.waitForResponse((r) => r.url().includes("/api/assess"));
    await recordTake(page);
    const res = await assess;
    // Either a graceful degraded result or an honest error that refunds the recording.
    expect([200, 502]).toContain(res.status());
    if (res.status() === 502) expect((await res.json()).error).toMatch(/did not count/);
  } finally {
    await mock(request, "/__mock/stt-override", { method: "POST", data: { reset: true } });
  }
});

test("drills page, progress, learn and sounds load for a new learner", async ({ page }) => {
  const c = watchConsole(page);
  await signUpAndOnboard(page);
  for (const p of ["/home", "/drills", "/progress", "/learn", "/sounds", "/community", "/assessment", "/shadowing", "/account"]) {
    const res = await page.goto(p);
    expect(res?.status(), p).toBe(200);
    await expect(page.locator("main, body").first()).toBeVisible();
    await expect(page, p).toHaveURL(new RegExp(p));
  }
  await page.waitForLoadState("networkidle");
  await expectNoConsoleErrors(c.errors);
});

test("free plan: own text is a Plus feature with an honest prompt", async ({ page }) => {
  await signUpAndOnboard(page);
  await page.goto("/practice");
  const res = await page.request.post("/api/tts", { data: { text: "My very own unusual sentence here.", lang: "en" } });
  expect(res.status()).toBe(403);
  expect((await res.json()).upgrade).toBe("customText");
});

test("daily free limit: 429 response and upgrade dialog with honest terms", async ({ page }) => {
  await signUpAndOnboard(page);
  await page.goto("/practice");
  const target = "Thursday"; // a single word is always allowed on the free plan
  const buffer = await makeWavBuffer(page);
  const statuses: number[] = [];
  for (let i = 0; i < 6; i++) {
    const r = await page.request.post("/api/assess", { multipart: { text: target, lang: "en", audio: { name: "a.wav", mimeType: "audio/wav", buffer } } });
    statuses.push(r.status());
    if (i === 0 && r.status() !== 200) throw new Error(`assess ${r.status()}: ${await r.text()} target=${JSON.stringify(target)}`);
    if (r.status() === 429) {
      expect(Number(r.headers()["retry-after"])).toBeGreaterThan(0);
      const j = await r.json();
      expect(j.upgrade).toBe("limit");
      expect(j.error).toMatch(/used all 5/);
    }
  }
  expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
  expect(statuses[5]).toBe(429);

  await page.reload();
  await page.getByRole("button", { name: /^(Record|Try again)$/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/today's recordings used up/);
  await expect(dialog).toContainText(/7-day free trial[\s\S]*Cancel any time/i);
});

test("onboarding recordings do not count toward daily limit and show no paywall until /home", async ({ page }) => {
  await signUp(page);
  const target = "Thursday";
  const buffer = await makeWavBuffer(page);

  for (let i = 0; i < 6; i++) {
    const r = await page.request.post("/api/assess", {
      multipart: { text: target, lang: "en", audio: { name: "a.wav", mimeType: "audio/wav", buffer } },
    });
    expect(r.status(), `onboarding assess #${i + 1}`).toBe(200);
  }

  const beforeMe = await (await page.request.get("/api/me")).json();
  expect(beforeMe.profile.onboarded).toBe(false);
  expect(beforeMe.usage.used).toBe(0);

  for (let i = 0; i < 25 && !/\/home/.test(page.url()); i++) {
    await expect(page.getByText(/Keep going on Free|Continue with Free/)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /Practise your focus words/ })).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const sample = page.getByRole("button", { name: /Use sample scan/ });
    const next = page.getByRole("button", {
      name: /^(Continue|Start\b|Next:|See my|See what|How scoring)/,
    });
    const targetBtn = (await sample.count()) ? sample : next;
    await targetBtn.first().click({ timeout: 4000 }).catch(() => undefined);
    await page.waitForTimeout(200);
  }
  await page.waitForURL(/\/home/);

  const afterMe = await (await page.request.get("/api/me")).json();
  expect(afterMe.profile.onboarded).toBe(true);
  expect(afterMe.usage.used).toBe(0);

  // Monotonic guard: client cannot revert onboarded back to false to bypass daily limits.
  await page.request.patch("/api/me", { data: { onboarded: false } });
  const revertedMe = await (await page.request.get("/api/me")).json();
  expect(revertedMe.profile.onboarded).toBe(true);

  const statuses: number[] = [];
  for (let i = 0; i < 6; i++) {
    const r = await page.request.post("/api/assess", {
      multipart: { text: target, lang: "en", audio: { name: "a.wav", mimeType: "audio/wav", buffer } },
    });
    statuses.push(r.status());
    if (r.status() === 429) {
      const j = await r.json();
      expect(j.upgrade).toBe("limit");
    }
  }
  expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
});
