/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Mock of every third-party service SayClear calls: ElevenLabs, OpenAI, Resend, Stripe (and a hosted
 * checkout + billing portal pages), on 127.0.0.1:12111. Plain node http, no dependencies besides `stripe`
 * (used to sign webhooks exactly like Stripe does).
 *
 * Run standalone: `node e2e/mock-server.ts`.  Test hooks live under /__mock/*.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import Stripe from "stripe";

const PORT = Number(process.env.MOCK_PORT ?? 12111);
const APP_URL = process.env.MOCK_APP_URL ?? "http://localhost:3100";
const WHSEC = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_test_e2e_secret";
const stripeLib = new Stripe("sk_test_mock");

// ---------------------------------------------------------------- state
let lastTarget = "";
let lastTargetAt = 0;
let sttOverride: Record<string, string> = {};
let sttFail = false;
const emails: { to: string; subject: string; html: string; text: string; at: number }[] = [];
const calls: { method: string; path: string }[] = [];

const customers = new Map<string, { id: string; email: string; name?: string; metadata: Record<string, string> }>();
const subs = new Map<string, any>();
const sessions = new Map<string, any>();
let seq = 1;
const nid = (p: string) => `${p}_mock${seq++}${Math.random().toString(36).slice(2, 7)}`;

const PRICES = (["plus", "pro"] as const).flatMap((plan) =>
  (["month", "year"] as const).map((interval) => ({
    id: `price_${plan}_${interval}`,
    object: "price",
    active: true,
    lookup_key: `sayclear_${plan}_${interval}ly`,
    product: `sayclear_${plan}`,
    currency: "usd",
    unit_amount: 999,
    recurring: { interval, interval_count: 1 },
  })),
);
const priceById = (id: string) => PRICES.find((p) => p.id === id) ?? PRICES[0];

const { voicedTone } = (await import(new URL("./mock-server-audio.ts", import.meta.url).href)) as typeof import("./mock-server-audio");

const wordsOf = (text: string) => text.split(/\s+/).filter(Boolean);

function alignmentFor(text: string, perWord = 0.35) {
  const ws = wordsOf(text);
  const chars: string[] = [];
  const starts: number[] = [];
  const ends: number[] = [];
  ws.forEach((w, wi) => {
    const s0 = wi * perWord;
    const step = (perWord * 0.9) / Math.max(1, w.length);
    for (let k = 0; k < w.length; k++) {
      chars.push(w[k]);
      starts.push(+(s0 + k * step).toFixed(3));
      ends.push(+(s0 + (k + 1) * step).toFixed(3));
    }
    if (wi < ws.length - 1) {
      chars.push(" ");
      starts.push(+(s0 + perWord * 0.9).toFixed(3));
      ends.push(+(s0 + perWord).toFixed(3));
    }
  });
  return { characters: chars, character_start_times_seconds: starts, character_end_times_seconds: ends };
}

// ---------------------------------------------------------------- http helpers
const readBody = (req: IncomingMessage) =>
  new Promise<Buffer>((resolve) => {
    const parts: Buffer[] = [];
    req.on("data", (c) => parts.push(c));
    req.on("end", () => resolve(Buffer.concat(parts)));
  });

function send(res: ServerResponse, status: number, body: unknown, type = "application/json") {
  res.writeHead(status, { "content-type": type });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function parseMultipart(body: Buffer, contentType: string) {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType);
  const fields: Record<string, string> = {};
  let fileSize = 0;
  if (!boundary) return { fields, fileSize };
  const sep = Buffer.from(`--${boundary[1] ?? boundary[2]}`);
  let idx = body.indexOf(sep);
  while (idx >= 0) {
    const next = body.indexOf(sep, idx + sep.length);
    if (next < 0) break;
    const part = body.subarray(idx + sep.length + 2, next - 2);
    const headEnd = part.indexOf("\r\n\r\n");
    const head = part.subarray(0, headEnd).toString();
    const data = part.subarray(headEnd + 4);
    const name = /name="([^"]+)"/.exec(head)?.[1];
    if (name) {
      if (/filename=/.test(head)) fileSize = data.length;
      else fields[name] = data.toString();
    }
    idx = next;
  }
  return { fields, fileSize };
}

/** stripe-node sends application/x-www-form-urlencoded with bracket notation; rebuild nested objects. */
function parseForm(raw: string) {
  const out: any = {};
  for (const [k, v] of new URLSearchParams(raw)) {
    const path = k.replace(/\]/g, "").split("[");
    let cur = out;
    path.forEach((p, i) => {
      if (i === path.length - 1) cur[p] = v;
      else cur = cur[p] ??= {};
    });
  }
  return out;
}

// ---------------------------------------------------------------- stripe
function subscriptionObject(s: any) {
  const price = priceById(s.priceId);
  return {
    id: s.id,
    object: "subscription",
    customer: s.customer,
    status: s.status,
    cancel_at_period_end: s.cancel_at_period_end,
    cancel_at: s.cancel_at_period_end ? s.period_end : null,
    trial_start: s.trial_start,
    trial_end: s.trial_end,
    items: {
      object: "list",
      data: [{ id: `si_${s.id}`, object: "subscription_item", current_period_end: s.period_end, price }],
    },
  };
}

async function fire(type: string, object: any, signed = true) {
  const event = { id: nid("evt"), object: "event", api_version: "2025-01-01", created: Math.floor(Date.now() / 1000), type, data: { object } };
  const payload = JSON.stringify(event);
  const header = signed ? stripeLib.webhooks.generateTestHeaderString({ payload, secret: WHSEC }) : "t=1,v1=bad";
  const r = await fetch(`${APP_URL}/api/stripe/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": header },
    body: payload,
  }).catch((e) => ({ status: 0, text: async () => String(e) }));
  return r.status;
}

function newSubscription(customer: string, priceId: string, trial: boolean) {
  const now = Math.floor(Date.now() / 1000);
  const s = {
    id: nid("sub"),
    customer,
    priceId,
    status: trial ? "trialing" : "active",
    cancel_at_period_end: false,
    period_end: now + 7 * 86400,
    trial_start: trial ? now : null,
    trial_end: trial ? now + 7 * 86400 : null,
  };
  subs.set(s.id, s);
  return s;
}

const page = (title: string, body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:sans-serif;max-width:480px;margin:40px auto"><h1>${title}</h1>${body}</body></html>`;

async function stripeApi(req: IncomingMessage, res: ServerResponse, url: URL, raw: string) {
  const p = url.pathname;
  const method = req.method;
  const form = method === "POST" ? parseForm(raw) : {};
  const list = (data: any[]) => send(res, 200, { object: "list", data, has_more: false, url: p });

  if (method === "GET" && p === "/v1/customers") {
    const email = url.searchParams.get("email");
    return list([...customers.values()].filter((c) => !email || c.email === email).map((c) => ({ object: "customer", ...c })));
  }
  if (method === "POST" && p === "/v1/customers") {
    const c = { id: nid("cus"), email: form.email, name: form.name, metadata: form.metadata ?? {} };
    customers.set(c.id, c);
    return send(res, 200, { object: "customer", ...c });
  }
  const cdel = /^\/v1\/customers\/([^/]+)$/.exec(p);
  if (method === "DELETE" && cdel) {
    for (const s of subs.values()) if (s.customer === cdel[1]) s.status = "canceled";
    customers.delete(cdel[1]);
    return send(res, 200, { id: cdel[1], object: "customer", deleted: true });
  }
  if (method === "GET" && p === "/v1/prices") return list(PRICES);
  if (method === "POST" && p === "/v1/checkout/sessions") {
    const id = nid("cs_test");
    const s = {
      id,
      object: "checkout.session",
      customer: form.customer,
      priceId: form.line_items?.["0"]?.price,
      trial: !!form.subscription_data?.trial_period_days,
      success_url: form.success_url,
      cancel_url: form.cancel_url,
      url: `http://127.0.0.1:${PORT}/__mock/checkout/${id}`,
    };
    sessions.set(id, s);
    return send(res, 200, s);
  }
  if (method === "POST" && p === "/v1/billing_portal/sessions") {
    const id = nid("bps");
    sessions.set(id, { id, customer: form.customer, return_url: form.return_url });
    return send(res, 200, { id, object: "billing_portal.session", url: `http://127.0.0.1:${PORT}/__mock/portal/${id}` });
  }
  if (method === "GET" && p === "/v1/subscriptions") {
    const cust = url.searchParams.get("customer");
    return list([...subs.values()].filter((s) => !cust || s.customer === cust).map(subscriptionObject));
  }
  const sub = /^\/v1\/subscriptions\/([^/]+)$/.exec(p);
  if (sub) {
    const s = subs.get(sub[1]);
    if (!s) return send(res, 404, { error: { type: "invalid_request_error", message: "No such subscription" } });
    if (method === "POST") {
      if (form.cancel_at_period_end !== undefined) s.cancel_at_period_end = form.cancel_at_period_end === "true";
    }
    if (method === "DELETE") s.status = "canceled";
    return send(res, 200, subscriptionObject(s));
  }
  const charge = /^\/v1\/charges\/([^/]+)$/.exec(p);
  if (method === "GET" && charge) {
    const cust = [...customers.keys()][0] ?? null;
    return send(res, 200, { id: charge[1], object: "charge", customer: cust });
  }
  return send(res, 404, { error: { type: "invalid_request_error", message: `Mock Stripe: unhandled ${method} ${p}` } });
}

// ---------------------------------------------------------------- main router
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  const p = url.pathname;
  calls.push({ method: req.method ?? "", path: p });
  try {
    const bodyBuf = await readBody(req);
    const ct = req.headers["content-type"] ?? "";

    // ---- test hooks
    if (p === "/__mock/health") return send(res, 200, { ok: true });
    if (p === "/__mock/emails") return send(res, 200, emails);
    if (p === "/__mock/reset" && req.method === "POST") {
      emails.length = 0;
      sttOverride = {};
      sttFail = false;
      return send(res, 200, { ok: true });
    }
    if (p === "/__mock/stt-override" && req.method === "POST") {
      const b = JSON.parse(bodyBuf.toString() || "{}");
      if (b.reset) sttOverride = {};
      if (b.word) sttOverride[String(b.word).toLowerCase()] = String(b.heard);
      if (typeof b.fail === "boolean") sttFail = b.fail;
      return send(res, 200, { ok: true, sttOverride });
    }
    if (p === "/__mock/calls") return send(res, 200, calls.slice(-200));
    if (p === "/__mock/stripe/event" && req.method === "POST") {
      const b = JSON.parse(bodyBuf.toString());
      return send(res, 200, { status: await fire(b.type, b.object, b.signed !== false) });
    }

    // ---- hosted checkout
    const co = /^\/__mock\/checkout\/([^/]+)$/.exec(p);
    if (co) {
      const s = sessions.get(co[1]);
      if (!s) return send(res, 404, "no session", "text/plain");
      if (req.method === "POST") {
        const sb = newSubscription(s.customer, s.priceId, s.trial);
        const obj = subscriptionObject(sb);
        await fire("checkout.session.completed", { id: s.id, object: "checkout.session", customer: s.customer, subscription: sb.id });
        await fire("customer.subscription.created", obj);
        res.writeHead(303, { location: s.success_url });
        return res.end();
      }
      const price = priceById(s.priceId);
      return send(
        res,
        200,
        page(
          "Mock Checkout",
          `<p id="plan">${price.lookup_key}</p><p>${s.trial ? "7-day free trial" : "No trial"}</p>
           <form method="post"><button type="submit">Pay</button></form><p><a href="${s.cancel_url}">Back</a></p>`,
        ),
        "text/html",
      );
    }

    // ---- hosted portal
    const po = /^\/__mock\/portal\/([^/]+)$/.exec(p);
    if (po) {
      const s = sessions.get(po[1]);
      if (!s) return send(res, 404, "no session", "text/plain");
      const current = [...subs.values()].find((x) => x.customer === s.customer && x.status !== "canceled");
      if (req.method === "POST" && current) {
        const action = url.searchParams.get("action");
        if (action === "cancel") current.cancel_at_period_end = true;
        if (action === "resume") current.cancel_at_period_end = false;
        if (action === "pro") current.priceId = "price_pro_month";
        if (action === "plus") current.priceId = "price_plus_month";
        await fire("customer.subscription.updated", subscriptionObject(current));
        res.writeHead(303, { location: s.return_url });
        return res.end();
      }
      const q = (a: string, label: string) => `<form method="post" action="?action=${a}"><button type="submit">${label}</button></form>`;
      return send(
        res,
        200,
        page(
          "Mock Billing Portal",
          current
            ? `<p id="plan">${priceById(current.priceId).lookup_key} (${current.status})</p>${q("cancel", "Cancel plan")}${q("resume", "Renew plan")}${q("pro", "Switch to Pro")}${q("plus", "Switch to Plus")}<p><a href="${s.return_url}">Return</a></p>`
            : `<p>No subscription</p><p><a href="${s.return_url}">Return</a></p>`,
        ),
        "text/html",
      );
    }

    // ---- Stripe API
    if (p.startsWith("/v1/") && !/^\/v1\/(text-to-speech|forced-alignment|speech-to-text)/.test(p)) {
      return await stripeApi(req, res, url, bodyBuf.toString());
    }

    // ---- ElevenLabs
    if (req.method === "GET" && p === "/v2/voices") {
      const v = (id: string, name: string, language: string, use_case: string, gender = "female") => ({
        voice_id: id,
        name,
        category: "professional",
        labels: { language, use_case, gender, accent: language === "en" ? "american" : language },
        high_quality_base_model_ids: ["eleven_v4"],
      });
      return send(res, 200, {
        voices: [
          v("v_en_teacher", "Emma - Teacher", "en", "informative_educational"),
          v("v_en_story", "Oliver - Storyteller", "en", "narrative_story", "male"),
          v("v_en_every", "Ava - Everyday", "en", "conversational"),
          v("v_sv_teacher", "Astrid - Teacher", "sv", "informative_educational"),
          v("v_es_teacher", "Lucia - Teacher", "es", "informative_educational"),
        ],
        has_more: false,
      });
    }
    const tts = /^\/v1\/text-to-speech\/([^/]+)\/with-timestamps$/.exec(p);
    if (req.method === "POST" && tts) {
      const b = JSON.parse(bodyBuf.toString());
      const text = String(b.text ?? "");
      return send(res, 200, {
        audio_base64: voicedTone(wordsOf(text).length).toString("base64"),
        alignment: alignmentFor(text),
        normalized_alignment: alignmentFor(text),
      });
    }
    if (req.method === "POST" && p === "/v1/forced-alignment") {
      const { fields, fileSize } = parseMultipart(bodyBuf, String(ct));
      lastTarget = fields.text ?? "";
      lastTargetAt = Date.now();
      const dur = Math.max(0.5, (fileSize - 44) / 32000);
      const ws = wordsOf(lastTarget);
      const per = dur / Math.max(1, ws.length);
      const characters: any[] = [];
      const words = ws.map((w, i) => ({ text: w, start: +(i * per).toFixed(3), end: +((i + 0.92) * per).toFixed(3), loss: 0.3 }));
      ws.forEach((w, i) => {
        const step = (per * 0.92) / w.length;
        for (let k = 0; k < w.length; k++)
          characters.push({ text: w[k], start: +(i * per + k * step).toFixed(3), end: +(i * per + (k + 1) * step).toFixed(3) });
        if (i < ws.length - 1) characters.push({ text: " ", start: +((i + 0.92) * per).toFixed(3), end: +((i + 1) * per).toFixed(3) });
      });
      return send(res, 200, { characters, words, loss: 0.3 });
    }
    if (req.method === "POST" && p === "/v1/speech-to-text") {
      const { fileSize } = parseMultipart(bodyBuf, String(ct));
      // Forced alignment (which carries the target text) runs concurrently; give it a moment to land.
      for (let i = 0; i < 20 && Date.now() - lastTargetAt > 5000; i++) await new Promise((r) => setTimeout(r, 100));
      if (sttFail) return send(res, 500, { detail: "mock stt failure" });
      const dur = Math.max(0.5, (fileSize - 44) / 32000);
      const ws = wordsOf(lastTarget).map((w) => {
        const bare = w.replace(/[^\p{L}\p{N}'’-]/gu, "").toLowerCase();
        return sttOverride[bare] ?? sttOverride["*"] ?? w;
      });
      const per = dur / Math.max(1, ws.length);
      const words = ws.map((w, i) => ({
        text: w,
        start: +(i * per).toFixed(3),
        end: +((i + 0.92) * per).toFixed(3),
        type: "word",
        logprob: -0.05,
      }));
      return send(res, 200, { language_code: "en", text: ws.join(" "), words });
    }

    // ---- OpenAI
    if (req.method === "POST" && p === "/chat/completions") {
      const b = JSON.parse(bodyBuf.toString());
      const generate = b.response_format?.type === "json_object";
      const content = generate
        ? JSON.stringify({ text: "The weather is rather nice today.", meaning: null, roman: null, focus: "th sounds", targets: ["weather", "rather"], words: ["weather", "rather"] })
        : JSON.stringify({ overallFeedback: "Mock coaching: keep the tongue between the teeth.", words: [] });
      return send(res, 200, { id: "chatcmpl-mock", object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }] });
    }

    // ---- Resend
    if (req.method === "POST" && p === "/emails") {
      const b = JSON.parse(bodyBuf.toString());
      emails.push({ to: Array.isArray(b.to) ? b.to[0] : b.to, subject: b.subject, html: b.html, text: b.text, at: Date.now() });
      return send(res, 200, { id: nid("email") });
    }

    // ---- Azure (not configured by default)
    send(res, 404, { error: `mock: unhandled ${req.method} ${p}` });
  } catch (err) {
    console.error("mock error", req.method, p, err);
    send(res, 500, { error: String(err) });
  }
});

server.listen(PORT, "127.0.0.1", () => console.log(`mock services on http://127.0.0.1:${PORT}`));
