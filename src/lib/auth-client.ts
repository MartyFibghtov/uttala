import { createAuthClient } from "better-auth/react";

/** Browser-side authentication client. Talks to /api/auth on the same origin. */
export const authClient = createAuthClient();

/**
 * Full-page navigation to a path on this site. Used after sign-in/out so every
 * cookie-dependent screen starts clean. Always same-origin by construction.
 */
export function navigate(path: string): void {
  window.location.assign(new URL(path, window.location.origin).toString());
}
