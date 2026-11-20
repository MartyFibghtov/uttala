import { ready } from "@/lib/server/auth";
import { unsubscribe } from "@/lib/server/community";
import { SITE } from "@/lib/site";

const page = (title: string, body: string, status: number) =>
  new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<meta name="robots" content="noindex"><title>${title} · ${SITE.name}</title>` +
      `<body style="font-family:system-ui,sans-serif;max-width:28rem;margin:18vh auto;padding:0 1.5rem;line-height:1.6;color:#111">` +
      `<h1 style="font-size:1.5rem">${title}</h1><p style="color:#555">${body}</p>` +
      `<p><a href="${SITE.url}" style="color:#111">Back to ${SITE.name}</a></p></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );

const escapeAttr = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * A link in an email can be opened by mail scanners, so GET only asks; the button (or a mail client's
 * one-click POST) does the unsubscribing.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const u = escapeAttr(url.searchParams.get("u") ?? "");
  const t = escapeAttr(url.searchParams.get("t") ?? "");
  return page(
    "Stop practice reminders?",
    `Press the button below to stop reminder emails. You can turn them back on in Settings at any time.</p>` +
      `<form method="post" action="/api/unsubscribe?u=${u}&amp;t=${t}"><button type="submit" style="font:inherit;padding:.6rem 1.2rem;border-radius:999px;border:0;background:#111;color:#fff;cursor:pointer">Stop reminders</button></form><p>`,
    200,
  );
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  await ready();
  const ok = await unsubscribe(url.searchParams.get("u") ?? "", url.searchParams.get("t") ?? "");
  return ok
    ? page("Reminders are off", "You will not get practice reminders any more. You can turn them back on in Settings.", 200)
    : page("This link did not work", "Sign in and turn reminders off in Settings instead.", 400);
}
