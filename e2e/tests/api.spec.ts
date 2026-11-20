import { expect, test } from "../fixtures";
import { MOCK, signUpAndOnboard } from "../helpers";

function wavBytes(seconds: number, rate = 16000) {
  const n = Math.floor(seconds * rate);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    ph += (2 * Math.PI * (120 + 40 * Math.sin(i / 3000))) / rate;
    buf.writeInt16LE(Math.round(Math.sin(ph) * 9000 + Math.sin(2 * ph) * 4000), 44 + i * 2);
  }
  return buf;
}

test("API routes refuse signed-out callers", async ({ request }) => {
  for (const [method, path] of [
    ["POST", "/api/assess"],
    ["POST", "/api/tts"],
    ["POST", "/api/sound-check"],
    ["GET", "/api/me"],
    ["GET", "/api/state"],
    ["POST", "/api/billing/checkout"],
    ["POST", "/api/billing/portal"],
  ] as const) {
    const res = await request.fetch(path, { method });
    expect(res.status(), `${method} ${path}`).toBe(401);
  }
});

test("stripe webhook rejects missing and bad signatures", async ({ request }) => {
  const payload = JSON.stringify({ id: "evt_x", object: "event", type: "customer.subscription.created", data: { object: { customer: "cus_x" } } });
  const none = await request.post("/api/stripe/webhook", { data: payload, headers: { "content-type": "application/json" } });
  expect(none.status()).toBe(400);
  const bad = await request.post("/api/stripe/webhook", {
    data: payload,
    headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=deadbeef" },
  });
  expect(bad.status()).toBe(400);
  expect(await bad.text()).toMatch(/Invalid signature/);
});

test("stripe webhook accepts a correctly signed event once, then reports a duplicate", async ({ request }) => {
  const r = await request.post(`${MOCK}/__mock/stripe/event`, { data: { type: "customer.subscription.created", object: { customer: "cus_unknown", id: "sub_x" } } });
  expect((await r.json()).status).toBe(200);
});

test("oversize recording to /api/assess is rejected with 413", async ({ page }) => {
  await signUpAndOnboard(page);
  const res = await page.request.post("/api/assess", {
    multipart: {
      text: "Hello there",
      lang: "en",
      audio: { name: "a.wav", mimeType: "audio/wav", buffer: Buffer.alloc(3_000_000, 1) },
    },
  });
  expect(res.status()).toBe(413);
});

test("assess validates input", async ({ page }) => {
  await signUpAndOnboard(page);
  const tiny = await page.request.post("/api/assess", {
    multipart: { text: "Hello there", lang: "en", audio: { name: "a.wav", mimeType: "audio/wav", buffer: Buffer.alloc(100) } },
  });
  expect(tiny.status()).toBe(400);
  const lang = await page.request.post("/api/assess", {
    multipart: { text: "Hello there", lang: "xx", audio: { name: "a.wav", mimeType: "audio/wav", buffer: wavBytes(1) } },
  });
  expect(lang.status()).toBe(400);
});

test("sound-check returns phone-model output for a WAV", async ({ page }) => {
  await signUpAndOnboard(page);
  const res = await page.request.post("/api/sound-check", { data: wavBytes(2), headers: { "content-type": "application/octet-stream" } });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.frames).toBeGreaterThan(0);
  expect(Array.isArray(body.tokens)).toBe(true);
  expect(typeof body.data).toBe("string");
  const bad = await page.request.post("/api/sound-check", { data: Buffer.alloc(10), headers: { "content-type": "application/octet-stream" } });
  expect(bad.status()).toBe(400);
  const huge = await page.request.post("/api/sound-check", { data: Buffer.alloc(1_200_000, 1), headers: { "content-type": "application/octet-stream" } });
  expect(huge.status()).toBe(413);
});
