"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/app-shell";
import { OrbCluster } from "@/components/orb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

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

/** Sign-in, sign-up and password-recovery screens share one layout and form. */
export function AuthForm({ mode }: { mode: Mode }) {
  const params = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [google, setGoogle] = useState(false);
  const copy = COPY[mode];
  const token = params.get("token");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/plans")
      .then((r) => r.json() as Promise<{ google?: boolean }>)
      .then((c) => !cancelled && setGoogle(!!c.google))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "sign-up") {
        const { error } = await authClient.signUp.email({ name: name.trim(), email: email.trim(), password });
        if (error) throw new Error(error.message ?? "We could not create the account.");
        window.location.assign("/onboarding");
      } else if (mode === "sign-in") {
        const { error } = await authClient.signIn.email({ email: email.trim(), password });
        if (error) throw new Error(error.message ?? "Email or password is not right.");
        window.location.assign("/home");
      } else if (mode === "forgot") {
        const { error } = await authClient.requestPasswordReset({ email: email.trim(), redirectTo: "/reset-password" });
        if (error) throw new Error(error.message ?? "We could not send the link.");
        setSent(true);
      } else {
        if (!token) throw new Error("This reset link is not valid any more. Request a new one.");
        const { error } = await authClient.resetPassword({ newPassword: password, token });
        if (error) throw new Error(error.message ?? "We could not save the new password.");
        window.location.assign("/sign-in?reset=1");
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
            <p className="mt-4 rounded-lg border bg-secondary px-3 py-2 text-sm">
              Password changed. Sign in with the new one.
            </p>
          )}

          {sent ? (
            <p className="mt-6 rounded-lg border bg-secondary px-3 py-3 text-sm" role="status">
              If an account exists for {email.trim()}, a reset link is on its way. It works for one hour.
            </p>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4">
              {mode === "sign-up" && (
                <div className="space-y-1.5">
                  <Label htmlFor="name">First name</Label>
                  <Input id="name" autoComplete="given-name" required value={name} onChange={(e) => setName(e.target.value)} />
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
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  {mode === "sign-up" && <p className="text-xs text-muted-foreground">At least 8 characters.</p>}
                </div>
              )}
              {error && (
                <p className="text-sm text-red-600" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full rounded-full" disabled={busy}>
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
                variant="outline"
                className="w-full rounded-full"
                onClick={() => void authClient.signIn.social({ provider: "google", callbackURL: "/home" })}
              >
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
        <OrbCluster />
        <div className="absolute bottom-10 left-10 max-w-sm">
          <p className="text-2xl font-semibold tracking-tight">Hear it. Say it. See exactly what to fix.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Word-by-word feedback on your own voice, in 17 languages.
          </p>
        </div>
      </div>
    </div>
  );
}
