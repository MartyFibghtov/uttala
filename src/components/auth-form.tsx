"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/logo";
import { ARTWORKS } from "@/components/artwork";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, navigate } from "@/lib/auth-client";

type Mode = "sign-in" | "sign-up" | "forgot" | "reset";

const COPY: Record<Mode, { title: string; lead: string; submit: string }> = {
  "sign-in": { title: "Welcome back", lead: "Sign in to pick up where you left off.", submit: "Sign in" },
  "sign-up": {
    title: "Create your account",
    lead: "Free to start. Your first feedback is two minutes away.",
    submit: "Create account",
  },
  forgot: {
    title: "Reset your password",
    lead: "Enter your email and we will send you a link to choose a new password.",
    submit: "Send reset link",
  },
  reset: { title: "Choose a new password", lead: "Use at least 8 characters.", submit: "Save new password" },
};

const OAUTH_ERRORS: Record<string, string> = {
  access_denied: "Google sign-in was cancelled.",
  account_not_linked: "An account with this email already exists. Sign in with your password first, then connect Google in Settings.",
  email_not_found: "Your Google account did not share an email address. Try signing in with email instead.",
  state_mismatch: "Your sign-in session expired. Please try again.",
  please_restart_the_process: "Your sign-in session expired. Please try again.",
};

export function GoogleMark() {
  return (
    <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

/** Sign-in, sign-up and password-recovery screens share one layout and form. */
export function AuthForm({ mode, googleEnabled }: { mode: Mode; googleEnabled?: boolean }) {
  const params = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [fetchedGoogle, setFetchedGoogle] = useState(false);
  const google = googleEnabled ?? fetchedGoogle;
  const copy = COPY[mode];
  const token = params.get("token");
  const oauthError = params.get("error");
  const linkInvalid = mode === "reset" && (!token || oauthError === "INVALID_TOKEN");
  const displayedError =
    error ??
    (linkInvalid
      ? "This reset link is not valid any more. Request a new one."
      : oauthError && mode !== "reset" && mode !== "forgot"
        ? (OAUTH_ERRORS[oauthError] ?? "Google sign-in could not be completed. Please try again.")
        : null);

  useEffect(() => {
    if (googleEnabled !== undefined) return;
    let cancelled = false;
    fetch("/api/plans")
      .then((r) => r.json() as Promise<{ google?: boolean }>)
      .then((c) => !cancelled && setFetchedGoogle(!!c.google))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [googleEnabled]);

  const signInWithGoogle = async () => {
    setGoogleBusy(true);
    setError(null);
    try {
      const { error } = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/home",
        newUserCallbackURL: "/onboarding",
        errorCallbackURL: mode === "sign-up" ? "/sign-up" : "/sign-in",
      });
      if (error) throw new Error(error.message ?? "Could not start Google sign-in.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start Google sign-in.");
      setGoogleBusy(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (mode === "sign-up" && !name.trim()) {
      setError("Enter your first name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === "sign-up") {
        const { error } = await authClient.signUp.email({ name: name.trim(), email: email.trim(), password });
        if (error) throw new Error(error.message ?? "We could not create the account.");
        navigate("/onboarding");
      } else if (mode === "sign-in") {
        const { error } = await authClient.signIn.email({ email: email.trim(), password });
        if (error) throw new Error(error.message ?? "Email or password is not right.");
        navigate("/home");
      } else if (mode === "forgot") {
        const { error } = await authClient.requestPasswordReset({ email: email.trim(), redirectTo: "/reset-password" });
        if (error) throw new Error(error.message ?? "We could not send the link.");
        setSent(true);
      } else {
        if (!token) throw new Error("This reset link is not valid any more. Request a new one.");
        const { error } = await authClient.resetPassword({ newPassword: password, token });
        if (error) throw new Error(error.message ?? "We could not save the new password.");
        navigate("/sign-in?reset=1");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const needsEmail = mode !== "reset";
  const needsPassword = mode !== "forgot";

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-6 py-6 sm:px-10">
        <Logo />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{copy.lead}</p>

          {params.get("reset") && mode === "sign-in" && (
            <p className="mt-4 rounded-lg border bg-secondary px-3 py-2 text-sm" role="status">
              Password changed. Sign in with the new one.
            </p>
          )}

          {sent ? (
            <div className="mt-6 rounded-lg border bg-secondary px-3 py-3 text-sm" role="status">
              <p>If an account exists for {email.trim()}, a reset link is on its way. It works for one hour.</p>
              <button
                type="button"
                className="mt-2 text-xs underline underline-offset-4"
                onClick={() => setSent(false)}
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4">
              {mode === "sign-up" && (
                <div className="space-y-1.5">
                  <Label htmlFor="name">First name</Label>
                  <Input id="name" autoComplete="given-name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
                </div>
              )}
              {needsEmail && (
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              )}
              {needsPassword && (
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <Label htmlFor="password">{mode === "reset" ? "New password" : "Password"}</Label>
                    {mode === "sign-in" && (
                      <Link href="/forgot-password" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
                        Forgot it?
                      </Link>
                    )}
                  </div>
                  <Input
                    id="password"
                    type="password"
                    autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                    required
                    minLength={mode === "sign-in" ? undefined : 8}
                    maxLength={128}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  {mode === "sign-up" && <p className="text-xs text-muted-foreground">At least 8 characters.</p>}
                </div>
              )}
              {displayedError && (
                <p className="text-sm text-red-600" role="alert">
                  {displayedError}
                </p>
              )}
              <Button type="submit" className="w-full rounded-full" disabled={busy || googleBusy || linkInvalid}>
                {busy && <Loader2 className="animate-spin" />}
                {copy.submit}
              </Button>
            </form>
          )}

          {google && (mode === "sign-in" || mode === "sign-up") && (
            <>
              <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or
                <span className="h-px flex-1 bg-border" />
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-full"
                disabled={busy || googleBusy}
                onClick={signInWithGoogle}
              >
                {googleBusy ? <Loader2 className="animate-spin" /> : <GoogleMark />}
                Continue with Google
              </Button>
            </>
          )}

          <p className="mt-6 text-sm text-muted-foreground">
            {mode === "sign-up" ? (
              <>
                Already have an account?{" "}
                <Link href="/sign-in" className="font-medium text-foreground underline-offset-4 hover:underline">
                  Sign in
                </Link>
              </>
            ) : (
              <>
                {mode === "sign-in" ? "New here?" : "Remembered it?"}{" "}
                <Link
                  href={mode === "sign-in" ? "/sign-up" : "/sign-in"}
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {mode === "sign-in" ? "Create an account" : "Back to sign in"}
                </Link>
              </>
            )}
          </p>
          {mode === "sign-up" && (
            <p className="mt-4 text-xs text-muted-foreground">
              By creating an account you agree to our{" "}
              <Link href="/terms" className="underline underline-offset-4">
                Terms
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="underline underline-offset-4">
                Privacy Policy
              </Link>
              .
            </p>
          )}
        </div>
      </div>

      <div className="aurora-wash relative hidden overflow-hidden border-l bg-secondary/40 lg:block">
        <Image
          src={ARTWORKS.heroAcoustic.src}
          alt=""
          fill
          sizes="50vw"
          loading="eager"
          fetchPriority="high"
          className="object-cover object-center dark:brightness-[0.8]"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />
        <div className="absolute right-10 bottom-10 left-10 max-w-md rounded-2xl border bg-card/85 p-6 shadow-lg ring-1 ring-black/5 backdrop-blur-md dark:ring-white/10">
          <p className="text-2xl font-semibold tracking-tight">Hear it. Say it. See exactly what to fix.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Word-by-word feedback on your own voice, in 17 languages.
          </p>
        </div>
      </div>
    </div>
  );
}
