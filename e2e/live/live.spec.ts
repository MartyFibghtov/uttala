import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { signUp, watchConsole } from "../helpers";
import { LIVE_META, LIVE_WAV } from "./global-setup";

/**
 * Real engines: ElevenLabs (TTS, alignment, STT), OpenAI (tailored text), Azure (English sound scores on Pro),
 * and the local phone model. Stripe and Resend are the local mock. Total real analyses: about 5.
 */
test.describe.configure({ mode: "serial" });

const meta = JSON.parse(readFileSync(LIVE_META, "utf8")) as { sentence: string; seconds: number };
const wav = () => readFileSync(LIVE_WAV);
const timings: Record<string, number> = {};
const note = (k: string, ms: number) => {
  timings[k] = Math.round(ms);
  console.log(`LATENCY ${k}: ${Math.round(ms)} ms`);
};

const chips = (page: Page) => page.locator('[aria-label*="out of 100"]');

/** Onboarding for English / "Getting clear" (intermediate), using the sample scan for the recorded steps. */
async function onboardIntermediate(page: Page) {
  for (let i = 0; i < 30 && !/\/home/.test(page.url()); i++) {
    const level = page.getByRole("button", { name: /people sometimes ask me to repeat/ });
    if (await level.count()) await level.first().click().catch(() => undefined);
    const sample = page.getByRole("button", { name: /Use sample scan/ });
    const next = page.getByRole("button", {
      name: /^(Continue|Start 3-part scan|Next:|See my|See what|How scoring|Practise my focus|Finish|Start practising)/,
    });
    const target = (await sample.count()) ? sample : next;
    await target.first().click({ timeout: 4000 }).catch(() => undefined);
    await page.waitForTimeout(250);
  }
  await page.waitForURL(/\/home/);
}

async function recordSentence(page: Page) {
  await page.getByRole("button", { name: /^(Record|Try again)$/ }).click();
  await page.waitForTimeout(Math.ceil(meta.seconds * 1000) + 700);
  await page.getByRole("button", { name: "Stop" }).click();
}

test("free: sign up, onboard (English, intermediate), practise the built-in sentence and get a real score", async ({ page }) => {
  const c = watchConsole(page);
  await signUp(page);
  await onboardIntermediate(page);
  const me = await (await page.request.get("/api/me")).json();
  expect(me.profile?.level ?? me.level).toBe("intermediate");

  await page.goto("/practice");
  await expect(page.getByText(meta.sentence).first()).toBeVisible();
  const t0 = Date.now();
  const assess = page.waitForResponse((r) => r.url().includes("/api/assess") && r.request().method() === "POST", { timeout: 90_000 });
  await recordSentence(page);
  const res = await assess;
  note("assess (ui, free, incl. record tail)", Date.now() - t0);
  expect(res.status(), await res.text().catch(() => "")).toBe(200);
  const body = await res.json();
  console.log("ASSESS engines", JSON.stringify(body.engines), "transcript:", body.transcript, "scores:", JSON.stringify(body.scores), "deduction:", body.deduction?.score, "depth:", body.depth);
  expect(body.demo).toBe(false);
  expect(body.engines.elevenlabs).toBe(true);
  expect(body.words.length).toBeGreaterThan(2);
  console.log("UI take words:", JSON.stringify(body.words.map((w: { text: string; status: string; score: number }) => `${w.text}:${w.status}:${w.score}`)));
  await expect(chips(page).first()).toBeVisible({ timeout: 20_000 });
  expect(await chips(page).count()).toBe(body.words.length);
  await expect(page.getByRole("button", { name: /Try again/ })).toBeVisible();
  expect(c.errors.filter((e) => !/Failed to load resource/.test(e)), c.errors.join("\n")).toEqual([]);

  // Scoring quality, on the exact clean native recording. Chrome's fake microphone loops the WAV, so the UI take
  // above can start mid-sentence (more so against a remote server); it proves the flow, not the score.
  const td = Date.now();
  const direct = await page.request.post("/api/assess", {
    multipart: { text: meta.sentence, lang: "en", level: "intermediate", audio: { name: "a.wav", mimeType: "audio/wav", buffer: wav() } },
  });
  expect(direct.status()).toBe(200);
  note("assess (api, clean wav)", Date.now() - td);
  const d = await direct.json();
  const ok = d.words.filter((w: { status: string }) => w.status === "ok").length;
  console.log(`native words clear: ${ok}/${d.words.length}`, JSON.stringify(d.words.map((w: { text: string; status: string; score: number }) => `${w.text}:${w.status}:${w.score}`)));
  expect(ok / d.words.length).toBeGreaterThan(0.5);
  expect(d.scores.accuracy).toBeGreaterThan(70);
});

test("drills page loads", async ({ page }) => {
  await signUp(page);
  await onboardIntermediate(page);
  const res = await page.goto("/drills");
  expect(res?.status()).toBe(200);
  await expect(page.locator("main")).toBeVisible();
});

test("/api/tts returns reference audio for a built-in sentence", async ({ page }) => {
  await signUp(page);
  await onboardIntermediate(page);
  const t0 = Date.now();
  const res = await page.request.post("/api/tts", { data: { text: meta.sentence, lang: "en", level: "intermediate" } });
  note("tts", Date.now() - t0);
  expect(res.status(), await res.text().catch(() => "")).toBe(200);
  const j = await res.json();
  expect(typeof j.audio).toBe("string");
  expect(j.audio.length).toBeGreaterThan(1000);
  console.log("TTS keys", Object.keys(j).join(","));
});

test("/api/sound-check returns phone-model logits for the real speech WAV", async ({ page }) => {
  await signUp(page);
  await onboardIntermediate(page);
  const times: number[] = [];
  for (let i = 0; i < 2; i++) {
    const t0 = Date.now();
    const res = await page.request.post("/api/sound-check", { data: wav(), headers: { "content-type": "audio/wav" } });
    times.push(Date.now() - t0);
    expect(res.status(), await res.text().catch(() => "")).toBe(200);
    const j = await res.json();
    expect(j.frames).toBeGreaterThan(20);
    expect(j.vocab).toBeGreaterThan(10);
    expect(Buffer.from(j.data, "base64").length).toBe(j.frames * j.vocab * 4);
    expect(j.tokens.length).toBe(j.vocab);
  }
  note("sound-check cold", times[0]);
  note("sound-check warm", times[1]);
});

test("/api/generate (OpenAI) returns a tailored sentence for a free learner", async ({ page }) => {
  await signUp(page);
  await onboardIntermediate(page);
  const t0 = Date.now();
  const res = await page.request.post("/api/generate", {
    data: { lang: "en", level: "intermediate", words: [{ text: "thought", heard: "tought", avg: 55 }, { text: "world", avg: 60 }] },
  });
  note("generate", Date.now() - t0);
  expect(res.status(), await res.text().catch(() => "")).toBe(200);
  const j = await res.json();
  console.log("GENERATE", JSON.stringify(j).slice(0, 400));
  expect(typeof j.text).toBe("string");
  expect(j.text.length).toBeGreaterThan(5);
});

test("Pro (mock checkout): Azure sound-level scores appear for English", async ({ page }) => {
  await signUp(page);
  await onboardIntermediate(page);
  await page.goto("/pricing");
  await page.getByRole("button", { name: /Try Pro free for 7 days/ }).click();
  await page.waitForURL(/__mock\/checkout/);
  await expect(page.locator("#plan")).toContainText(/sayclear_pro_/);
  await page.getByRole("button", { name: "Pay" }).click();
  await page.waitForURL(/checkout=success|\/account/);
  await page.goto("/account");
  await expect(page.getByRole("main").getByText("Pro plan")).toBeVisible({ timeout: 20_000 });

  await page.goto("/practice");
  const t0 = Date.now();
  const assess = page.waitForResponse((r) => r.url().includes("/api/assess") && r.request().method() === "POST", { timeout: 90_000 });
  await recordSentence(page);
  const res = await assess;
  note("assess (ui, pro, incl. record tail)", Date.now() - t0);
  expect(res.status(), await res.text().catch(() => "")).toBe(200);
  const body = await res.json();
  console.log("PRO engines", JSON.stringify(body.engines), "phonemeLevel", body.phonemeLevel, "depth", body.depth, "deduction", body.deduction?.score);
  expect(body.engines.azure).toBe(true);
  expect(body.phonemeLevel).toBe(true);
  expect(body.depth).toBe("sound");
  const measured = body.words.filter((w: { phonemesMeasured?: boolean; phonemes?: unknown[] }) => w.phonemesMeasured && (w.phonemes?.length ?? 0) > 0);
  expect(measured.length).toBeGreaterThan(0);
  const ok = body.words.filter((w: { status: string }) => w.status === "ok").length;
  expect(ok / body.words.length).toBeGreaterThan(0.5);
  await expect(chips(page).first()).toBeVisible({ timeout: 20_000 });

  // Pure API latency with the same audio.
  const t1 = Date.now();
  const api = await page.request.post("/api/assess", { multipart: { text: meta.sentence, lang: "en", level: "intermediate", audio: { name: "a.wav", mimeType: "audio/wav", buffer: wav() } } });
  note("assess (api, pro)", Date.now() - t1);
  expect(api.status(), await api.text().catch(() => "")).toBe(200);
});
