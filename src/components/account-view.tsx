"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CreditCard, Download, Loader2, LogOut, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { LanguagePicker, LevelPicker } from "@/components/pickers";
import { openBillingPortal, Pricing } from "@/components/pricing";
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
import { authClient } from "@/lib/auth-client";
import { LEVELS } from "@/lib/levels";
import { PLANS } from "@/lib/plans";
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

function DeleteAccount() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    const { error } = await authClient.deleteUser({ password });
    if (error) {
      setError(error.message ?? "We could not delete the account. Check your password.");
      setBusy(false);
      return;
    }
    clearProgress();
    window.location.assign("/");
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
          <Label htmlFor="delete-password">Confirm with your password</Label>
          <Input
            id="delete-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Keep my account</Button>
          </DialogClose>
          <Button variant="destructive" onClick={remove} disabled={busy || !password}>
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

export function AccountView() {
  const { me, refresh } = useAccount();
  const params = useSearchParams();
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const handled = useRef(false);
  const checkout = params.get("checkout");

  // Back from Stripe: pull the new plan straight away instead of waiting for the webhook.
  useEffect(() => {
    if (!checkout || handled.current) return;
    handled.current = true;
    void (async () => {
      if (checkout === "success") {
        await fetch("/api/billing/sync", { method: "POST" }).catch(() => undefined);
        await refresh();
        toast.success("You're all set. Your new plan is active.");
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

  const download = () => {
    const blob = new Blob([JSON.stringify({ account: me.user, profile: me.profile, ...exportProgress() }, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "uttala-data.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const signOut = async () => {
    await authClient.signOut();
    window.location.assign("/");
  };

  return (
    <>
      <PageHeader title="Settings" description="Your plan, learning settings, appearance and data." />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{me.billing ? `${PLANS[me.plan].name} plan` : "Your plan"}</CardTitle>
            {me.billing ? <PlanStatus /> : <p className="text-sm text-muted-foreground">Everything is included.</p>}
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm">
              <span className="font-medium tabular-nums">
                {Math.max(0, me.usage.limit - me.usage.used)} of {me.usage.limit}
              </span>{" "}
              <span className="text-muted-foreground">recordings left today. Resets at midnight UTC.</span>
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
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-full" onClick={download}>
              <Download />
              Download my data
            </Button>
            <Button variant="outline" className="rounded-full" onClick={signOut}>
              <LogOut />
              Sign out
            </Button>
            <DeleteAccount />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
