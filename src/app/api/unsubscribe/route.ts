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

/** Stops reminder emails from the signed link in each one. Works without signing in. */
async function handle(request: Request) {
  const url = new URL(request.url);
  await ready();
  const ok = await unsubscribe(url.searchParams.get("u") ?? "", url.searchParams.get("t") ?? "");
  return ok
    ? page("Reminders are off", "You will not get practice reminders any more. You can turn them back on in Settings.", 200)
    : page("This link did not work", "Sign in and turn reminders off in Settings instead.", 400);
}

export const GET = handle;
// Mail clients that support one-click unsubscribe send a POST to the same address.
export const POST = handle;
