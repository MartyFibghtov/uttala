import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

const APP = ["/home", "/learn", "/practice", "/drills", "/sounds", "/progress", "/community", "/assessment", "/account", "/onboarding"];
const AUTH = ["/sign-in", "/sign-up"];

/**
 * Fast redirects based on whether a session cookie is present. This is a
 * convenience only: every API route verifies the session itself.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const signedIn = !!getSessionCookie(request);
  const inApp = APP.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (inApp && !signedIn) return NextResponse.redirect(new URL("/sign-in", request.url));
  if (signedIn && (pathname === "/" || AUTH.includes(pathname))) {
    return NextResponse.redirect(new URL("/home", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/sign-in",
    "/sign-up",
    "/home/:path*",
    "/learn/:path*",
    "/practice/:path*",
    "/drills/:path*",
    "/sounds/:path*",
    "/progress/:path*",
    "/community/:path*",
    "/assessment/:path*",
    "/account/:path*",
    "/onboarding/:path*",
  ],
};
