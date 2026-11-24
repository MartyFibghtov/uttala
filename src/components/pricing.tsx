"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { authClient } from "@/lib/auth-client";
import { claimNudge, snoozeNudges } from "@/lib/store";
import {
  formatPrice,
  perMonth,
  PLANS,
  TRIAL_DAYS,
  yearlySaving,
  type Interval,
  type PlanId,
} from "@/lib/plans";
import { cn } from "@/lib/utils";

interface Capabilities {
  billing: boolean;
  phonemes: boolean;
}

/** Start checkout (or open the billing portal for existing subscribers) and leave for Stripe. */
export async function startCheckout(plan: PlanId, interval: Interval): Promise<void> {
  const res = await fetch("/api/billing/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ plan, interval }),
  });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error ?? "We could not start the checkout.");
  window.location.assign(data.url);
}

export async function openBillingPortal(): Promise<void> {
  const res = await fetch("/api/billing/portal", { method: "POST" });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error ?? "We could not open billing.");
  window.location.assign(data.url);
}

interface Props {
  /** Set when the viewer is signed in; buttons then go straight to checkout. */
  currentPlan?: PlanId;
  trialAvailable?: boolean;
  /** Leave the free plan out, e.g. inside an upgrade prompt. */
  paidOnly?: boolean;
}

export function Pricing({ currentPlan: planProp, trialAvailable: trialProp = true, paidOnly }: Props) {
  // The public pricing page is static, so it finds out on the client whether the visitor is signed in.
  const [detected, setDetected] = useState<{ plan: PlanId; trial: boolean } | null>(null);
  useEffect(() => {
    if (planProp !== undefined) return;
    let cancelled = false;
    // get-session answers 200 with null when signed out, so visitors see no failed request.
    authClient
      .getSession()
      .then(({ data }) => (data?.user ? fetch("/api/me") : null))
      .then((r) => (r?.ok ? (r.json() as Promise<{ plan?: PlanId; trialAvailable?: boolean }>) : null))
      .then((m) => !cancelled && m?.plan && setDetected({ plan: m.plan, trial: m.trialAvailable !== false }))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [planProp]);
  const currentPlan = planProp ?? detected?.plan;
  const trialAvailable = planProp !== undefined ? trialProp : (detected?.trial ?? true);
  const [interval, setInterval] = useState<Interval>(currentPlan !== undefined ? "month" : "year");
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [pending, setPending] = useState<PlanId | null>(null);
  const signedIn = currentPlan !== undefined;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/plans")
      .then((r) => r.json() as Promise<Capabilities>)
      .then((c) => !cancelled && setCaps(c))
      .catch(() => !cancelled && setCaps({ billing: false, phonemes: false }));
    return () => {
      cancelled = true;
    };
  }, []);

  // Pro is built around sound-by-sound scoring, so it is only offered where that engine is switched on.
  const ids = (["free", "plus", "pro"] as PlanId[]).filter(
    (id) => !(paidOnly && id === "free") && !(id === "pro" && caps && !caps.phonemes),
  );
  const saving = yearlySaving(PLANS.plus);

  const choose = async (plan: PlanId) => {
    setPending(plan);
    try {
      await startCheckout(plan, interval);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
      setPending(null);
    }
  };

  return (
    <div>
      <div className="mb-6 flex justify-center">
        <div className="inline-flex rounded-full border bg-background p-1 text-sm" role="group" aria-label="Billing period">
          {(["month", "year"] as Interval[]).map((i) => (
            <button
              key={i}
              type="button"
              aria-pressed={interval === i}
              onClick={() => setInterval(i)}
              className={cn(
                "rounded-full px-4 py-1.5 font-medium text-muted-foreground transition-colors",
                interval === i && "bg-foreground text-background",
              )}
            >
              {i === "month" ? "Monthly" : `Yearly · save ${saving}%`}
            </button>
          ))}
        </div>
      </div>

      <div
        className={cn(
          "mx-auto grid gap-4",
          ids.length === 3 ? "max-w-5xl lg:grid-cols-3" : ids.length === 2 ? "max-w-3xl md:grid-cols-2" : "max-w-sm",
        )}
      >
        {ids.map((id) => {
          const plan = PLANS[id];
          const popular = id === "plus";
          const isCurrent = currentPlan === id;
          const paid = id !== "free";
          return (
            <div
              key={id}
              className={cn(
                "relative flex flex-col rounded-2xl border bg-card p-6",
                popular && "card-featured",
              )}
            >
              {popular && (
                <span className="absolute -top-3 left-6 rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background">
                  Most popular
                </span>
              )}
              <h3 className="text-lg font-semibold">{plan.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>
              <p className="mt-5 flex items-baseline gap-1">
                <span className="text-4xl font-semibold tracking-tight tabular-nums">
                  {formatPrice(perMonth(plan, interval))}
                </span>
                <span className="text-sm text-muted-foreground">{paid ? "/ month" : "forever"}</span>
              </p>
              <p className="mt-1 h-5 text-xs text-muted-foreground">
                {paid && interval === "year" && `${formatPrice(plan.price.year)} billed once a year`}
                {paid && interval === "month" && "Billed monthly"}
              </p>

              <div className="mt-5">
                {!paid ? (
                  signedIn ? (
                    <Button variant="outline" className="w-full rounded-full" disabled>
                      {isCurrent ? "Your plan" : "Included"}
                    </Button>
                  ) : (
                    <Button asChild variant="outline" className="w-full rounded-full">
                      <Link href="/sign-up">Start free</Link>
                    </Button>
                  )
                ) : isCurrent ? (
                  <Button variant="outline" className="w-full rounded-full" disabled>
                    Your plan
                  </Button>
                ) : signedIn ? (
                  <Button
                    className="w-full rounded-full"
                    variant={popular ? "default" : "outline"}
                    disabled={pending !== null || (caps !== null && !caps.billing)}
                    onClick={() => choose(id)}
                  >
                    {pending === id && <Loader2 className="animate-spin" />}
                    {currentPlan !== "free"
                      ? `Switch to ${plan.name}`
                      : trialAvailable
                        ? `Try ${plan.name} free for ${TRIAL_DAYS} days`
                        : `Get ${plan.name}`}
                  </Button>
                ) : (
                  <Button asChild className="w-full rounded-full" variant={popular ? "default" : "outline"}>
                    <Link href="/sign-up">Try {plan.name} free for {TRIAL_DAYS} days</Link>
                  </Button>
                )}
              </div>

              <ul className="mt-6 space-y-2.5 text-sm">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        {caps && !caps.billing && signedIn
          ? "Payments are not switched on for this site yet."
          : `Paid plans start with a ${TRIAL_DAYS}-day free trial for new subscribers. Cancel any time in two clicks. Prices in US dollars; tax may be added at checkout.`}
      </p>
    </div>
  );
}

/** The honest one-liner shown with every in-app upgrade prompt: what it costs, the trial, how to leave. */
export function plusTerms(trialAvailable: boolean): string {
  const plus = PLANS.plus;
  const price = `${formatPrice(plus.price.month)} a month or ${formatPrice(plus.price.year)} a year`;
  return trialAvailable
    ? `Plus: ${TRIAL_DAYS} days free, then ${price}. Cancel anytime in two clicks, before the trial ends and you pay nothing.`
    : `Plus: ${price}. Cancel anytime in two clicks.`;
}

/**
 * Lets one unprompted upgrade card show per day at most, and none for a week after the learner dismisses one.
 * The state lives in this browser only. Cards the learner asks for themselves (a locked button, a reached
 * limit) do not use this.
 */
export function useNudge(kind: string, when: boolean): { visible: boolean; dismiss: () => void } {
  const [dismissed, setDismissed] = useState(false);
  // Read from this browser's storage; the server render and hydration see "hidden".
  const allowed = useSyncExternalStore(
    () => () => undefined,
    () => when && claimNudge(kind),
    () => false,
  );
  return {
    visible: allowed && !dismissed,
    dismiss: () => {
      snoozeNudges(7);
      setDismissed(true);
    },
  };
}

/**
 * A calm upgrade card for a moment where Plus is directly useful. It says what Plus adds, what it costs and
 * how to leave, and "Not now" is always as visible as the main button.
 */
export function UpgradeCard({
  title,
  children,
  currentPlan = "free",
  trialAvailable = true,
  onDismiss,
  ctaLabel,
  className,
}: {
  title: string;
  /** What Plus would add here, ideally with something concrete from the learner's own session. */
  children: React.ReactNode;
  currentPlan?: PlanId;
  trialAvailable?: boolean;
  onDismiss?: () => void;
  ctaLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("rounded-xl border bg-card p-4", className)}>
      <p className="text-sm font-medium">{title}</p>
      <div className="mt-1 space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
      <p className="mt-3 text-xs text-muted-foreground">{plusTerms(trialAvailable)}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" className="rounded-full" onClick={() => setOpen(true)}>
          {ctaLabel ?? (trialAvailable ? `Try Plus free for ${TRIAL_DAYS} days` : "See Plus")}
        </Button>
        {onDismiss && (
          <Button size="sm" variant="ghost" className="rounded-full" onClick={onDismiss}>
            Not now
          </Button>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl">{title}</DialogTitle>
            <DialogDescription>Compare the plans and choose. You can stay on Free as long as you like.</DialogDescription>
          </DialogHeader>
          <Pricing currentPlan={currentPlan} trialAvailable={trialAvailable} paidOnly />
        </DialogContent>
      </Dialog>
    </div>
  );
}
