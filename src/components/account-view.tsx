"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CreditCard, Download, Loader2, LogOut, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { GoogleMark } from "@/components/auth-form";
import { LanguagePicker, LevelPicker } from "@/components/pickers";
import { openBillingPortal, Pricing } from "@/components/pricing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccount } from "@/hooks/use-account";
import { authClient, navigate } from "@/lib/auth-client";
import { LEVELS } from "@/lib/levels";
import { PLANS, resetTimeLabel } from "@/lib/plans";
import { ReminderToggle } from "@/components/community-view";
import { ThemePicker } from "@/components/theme";
import { GOALS } from "@/lib/gamification";
import { clearProgress, exportProgress, setSettings, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const formatDate = (unixSeconds: number) =>
  new Date(unixSeconds * 1000).toLocaleDateString(undefined, { dateStyle: "long" });

function PlanStatus() {
  const { me } = useAccount();
  const sub = me.subscription;
  if (me.plan === "free" || !sub) {
    return <p className="text-sm text-muted-foreground">{PLANS.free.tagline} Upgrade below whenever you are ready.</p>;
  }
  const date = sub.periodEnd ? formatDate(sub.periodEnd) : null;
  let line: string;
  if (sub.status === "past_due") line = "Your last payment did not go through. Update your card to keep your plan.";
  else if (sub.cancelAtPeriodEnd) line = date ? `Cancelled. You keep ${PLANS[me.plan].name} until ${date}.` : "Cancelled.";
  else if (sub.status === "trialing") line = date ? `Free trial. Your first payment is on ${date}.` : "Free trial.";
  else line = date ? `Renews on ${date}, billed ${sub.interval === "year" ? "yearly" : "monthly"}.` : "Active.";
  return <p className={sub.status === "past_due" ? "text-sm text-red-600" : "text-sm text-muted-foreground"}>{line}</p>;
}

function DeleteAccount({ hasPassword }: { hasPassword: boolean }) {
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsFreshSession, setNeedsFreshSession] = useState(false);

  const readyToDelete = hasPassword ? confirmation.length > 0 : confirmation.trim().toUpperCase() === "DELETE";

  const remove = async () => {
    setBusy(true);
    setError(null);
    setNeedsFreshSession(false);
    const { error } = await authClient
      .deleteUser(hasPassword ? { password: confirmation } : {})
      .catch(() => ({ error: { code: "NETWORK", message: "Could not reach the server. Check your connection and try again." } }));
    if (error) {
      const freshNeeded = !hasPassword && (error.code === "SESSION_EXPIRED" || /fresh|expired/i.test(error.message ?? ""));
      setNeedsFreshSession(freshNeeded);
      setError(
        freshNeeded
          ? "For your security, sign in with Google again before deleting your account."
          : (error.message ?? (hasPassword ? "We could not delete the account. Check your password." : "We could not delete the account.")),
      );
      setBusy(false);
      return;
    }
    clearProgress();
    navigate("/");
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="rounded-full text-red-600 hover:text-red-700">
          <Trash2 />
          Delete account
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete your account?</DialogTitle>
          <DialogDescription>
            This cancels any subscription immediately and permanently deletes your account, history and drill list. It
            cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="delete-confirm">
            {hasPassword ? "Confirm with your password" : "Type DELETE to confirm"}
          </Label>
          <Input
            id="delete-confirm"
            type={hasPassword ? "password" : "text"}
            autoComplete={hasPassword ? "current-password" : "off"}
            placeholder={hasPassword ? undefined : "DELETE"}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
          {needsFreshSession && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-1 rounded-full"
              onClick={() => void authClient.signIn.social({ provider: "google", callbackURL: "/account", errorCallbackURL: "/account" })}
            >
              <GoogleMark />
              Re-authenticate with Google
            </Button>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Keep my account</Button>
          </DialogClose>
          <Button variant="destructive" onClick={remove} disabled={busy || !readyToDelete}>
            {busy && <Loader2 className="animate-spin" />}
            Delete everything
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DailyGoal() {
  const goal = useStore("settings").goal;
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label="Daily goal">
      {GOALS.map((g) => (
        <button
          key={g.xp}
          type="button"
          role="radio"
          aria-checked={goal === g.xp}
          onClick={() => setSettings({ goal: g.xp })}
          className={cn(
            "rounded-xl border p-3 text-left transition-colors hover:border-foreground/40",
            goal === g.xp && "border-foreground ring-1 ring-foreground",
          )}
        >
          <span className="block text-sm font-medium">{g.name}</span>
          <span className="block text-xs text-muted-foreground">
            {g.xp} points · {g.detail}
          </span>
        </button>
      ))}
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ["R", "Start or stop recording"],
  ["L", "Listen to the reference"],
];

function SoundCheckToggle() {
  return (
    <p className="max-w-xl text-sm text-muted-foreground">
      Every recording is rated by deduction: it starts at 100 and each wrong sound, unclear word, extra pause or off
      rhythm and melody costs points. The precise sound check runs on our server, on every plan: your recording is
      analysed in memory and not stored. There is nothing to download.
    </p>
  );
}

export function AccountView() {
  const { me, refresh } = useAccount();
  const params = useSearchParams();
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const [linkingGoogle, setLinkingGoogle] = useState(false);
  const [providers, setProviders] = useState<string[] | null>(null);
  const [googleCapable, setGoogleCapable] = useState(false);
  const handled = useRef(false);
  const checkout = params.get("checkout");
  const authError = params.get("error");

  useEffect(() => {
    let cancelled = false;
    void authClient.listAccounts().then(({ data }) => {
      if (!cancelled && data) setProviders(data.map((a) => a.providerId));
    });
    fetch("/api/plans")
      .then((r) => r.json() as Promise<{ google?: boolean }>)
      .then((c) => !cancelled && setGoogleCapable(!!c.google))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authError) return;
    toast.error("Could not connect Google account. Make sure your Google account uses the same email or try again.");
    router.replace("/account");
  }, [authError, router]);

  // Back from Stripe: pull the new plan straight away instead of waiting for the webhook.
  useEffect(() => {
    if (!checkout || handled.current) return;
    handled.current = true;
    void (async () => {
      if (checkout === "success") {
        const synced = await fetch("/api/billing/sync", { method: "POST" })
          .then((r) => r.ok)
          .catch(() => false);
        await refresh();
        if (synced) toast.success("You're all set. Your new plan is active.");
        else toast.message("Thanks. Your payment went through; your plan can take a minute to show. Refresh if it does not.");
      } else if (checkout === "cancel" || checkout === "cancelled") {
        toast.message("Checkout cancelled. You have not been charged.");
      }
      router.replace("/account");
    })();
  }, [checkout, refresh, router]);

  const manage = async () => {
    setOpening(true);
    try {
      await openBillingPortal();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open billing.");
      setOpening(false);
    }
  };

  const [exporting, setExporting] = useState(false);
  const download = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/me/export");
      if (!res.ok) throw new Error("Could not prepare your data.");
      const server = (await res.json()) as Record<string, unknown>;
      // The server copy is the record; this device's copy is included in case it is newer.
      const blob = new Blob([JSON.stringify({ ...server, thisDevice: exportProgress() }, null, 2)], {
        type: "application/json",
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "sayclear-data.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not download your data.");
    } finally {
      setExporting(false);
    }
  };

  const signOut = async () => {
    try {
      await authClient.signOut();
    } catch {
      // Leave anyway; the server session expires on its own.
    }
    navigate("/");
  };

  const hasPassword = providers ? providers.includes("credential") : true;
  const hasGoogle = providers ? providers.includes("google") : false;

  const connectGoogle = async () => {
    setLinkingGoogle(true);
    try {
      const { error } = await authClient.linkSocial({
        provider: "google",
        callbackURL: "/account",
        errorCallbackURL: "/account",
      });
      if (error) throw new Error(error.message ?? "Could not start Google connection.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not connect Google.");
      setLinkingGoogle(false);
    }
  };

  return (
    <>
      <PageHeader title="Settings" description="Your plan, learning settings, appearance and data." />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {me.billing ? (
                <span className={cn(me.plan !== "free" && "premium-text")}>{PLANS[me.plan].name} plan</span>
              ) : (
                "Your plan"
              )}
            </CardTitle>
            {me.billing ? <PlanStatus /> : <p className="text-sm text-muted-foreground">Everything is included.</p>}
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm">
              <span className="font-medium tabular-nums">
                {Math.max(0, me.usage.limit - me.usage.used)} of {me.usage.limit}
              </span>{" "}
              <span className="text-muted-foreground">recordings left today. Resets at {resetTimeLabel()} your time (midnight UTC).</span>
            </p>
            {me.subscription && (
              <Button variant="outline" className="rounded-full" onClick={manage} disabled={opening}>
                {opening ? <Loader2 className="animate-spin" /> : <CreditCard />}
                Manage billing, invoices and cancellation
              </Button>
            )}
            {me.billing && me.plan === "free" && <Pricing currentPlan={me.plan} trialAvailable={me.trialAvailable} paidOnly />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Learning</CardTitle>
            <p className="text-sm text-muted-foreground">{LEVELS[me.profile.level].description}</p>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <LanguagePicker />
            <LevelPicker />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daily goal</CardTitle>
            <p className="text-sm text-muted-foreground">
              A recording earns 10 to 20 points, a listening round 1 or 2. Your streak grows on any day you practise;
              the goal is what you aim for.
            </p>
          </CardHeader>
          <CardContent>
            <DailyGoal />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rating and sound model</CardTitle>
          </CardHeader>
          <CardContent>
            <SoundCheckToggle />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Practice reminders</CardTitle>
          </CardHeader>
          <CardContent>
            <ReminderToggle />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Appearance and shortcuts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <ThemePicker />
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              {SHORTCUTS.map(([key, what]) => (
                <div key={key} className="flex items-center gap-3">
                  <dt>
                    <kbd className="rounded border bg-secondary px-1.5 py-0.5 font-mono text-xs">{key}</kbd>
                  </dt>
                  <dd className="text-muted-foreground">{what}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {me.user.name ? `${me.user.name} · ` : ""}
              {me.user.email}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Your recordings are analysed and then discarded; we never store your audio. Scores and drill words are
              saved to your account.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {providers && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">Sign-in:</span>
                {hasPassword && <Badge variant="secondary">Email &amp; password</Badge>}
                {hasGoogle && (
                  <Badge variant="secondary" className="gap-1.5">
                    <GoogleMark />
                    Google
                  </Badge>
                )}
                {googleCapable && !hasGoogle && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 rounded-full text-xs"
                    disabled={linkingGoogle}
                    onClick={connectGoogle}
                  >
                    {linkingGoogle ? <Loader2 className="animate-spin" /> : <GoogleMark />}
                    Connect Google
                  </Button>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="rounded-full" onClick={() => void download()} disabled={exporting}>
                {exporting ? <Loader2 className="animate-spin" /> : <Download />}
                Download my data
              </Button>
              <Button variant="outline" className="rounded-full" onClick={signOut}>
                <LogOut />
                Sign out
              </Button>
              <DeleteAccount hasPassword={hasPassword} />
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
