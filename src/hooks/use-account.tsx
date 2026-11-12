"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Orb } from "@/components/orb";
import { Pricing } from "@/components/pricing";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { setStoreUser, startSync } from "@/lib/store";
import type { Me, Profile } from "@/lib/types";

export type UpgradeReason = "limit" | "customText" | "voice" | "prosody" | "phonemes";

const UPGRADE_COPY: Record<UpgradeReason, { title: string; body: string }> = {
  limit: {
    title: "That's today's recordings used up",
    body: "Your allowance resets at midnight UTC. Upgrade to keep practising now, with up to 60 recordings a day.",
  },
  customText: {
    title: "Practise the words you actually need",
    body: "Paste your presentation, interview answers or favourite lines and get the same feedback on them.",
  },
  voice: {
    title: "Choose who you learn from",
    body: "Pick a patient teacher, a storyteller or an everyday voice, and hear several speakers in listening drills.",
  },
  prosody: {
    title: "See your rhythm and melody",
    body: "Compare how your pitch rises and falls with a native voice, word by word. It is what makes speech sound natural.",
  },
  phonemes: {
    title: "Score every single sound",
    body: "See exactly which sound inside a word is off, and track your weakest sounds over time.",
  },
};

interface AccountState {
  me: Me;
  refresh: () => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  /** Count one analysis locally so the meter moves without a round trip. */
  noteAnalysis: () => void;
  promptUpgrade: (reason: UpgradeReason) => void;
}

const AccountContext = createContext<AccountState | null>(null);

export function useAccount(): AccountState {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount must be used inside AccountProvider");
  return ctx;
}

async function fetchMe(): Promise<Me | null> {
  const res = await fetch("/api/me");
  if (res.status === 401) return null;
  if (!res.ok) throw new Error("Could not load your account.");
  return (await res.json()) as Me;
}

/** Loads the signed-in account, guards the app behind it and hosts the upgrade prompt. */
export function AccountProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [failed, setFailed] = useState(false);
  const [upgrade, setUpgrade] = useState<UpgradeReason | null>(null);

  const apply = useCallback((next: Me | null) => {
    if (!next) {
      window.location.assign("/sign-in");
      return;
    }
    setStoreUser(next.user.id);
    setMe(next);
    setFailed(false);
  }, []);

  const load = useCallback(
    () =>
      fetchMe()
        .then(apply)
        .catch(() => setFailed(true)),
    [apply],
  );

  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((next) => {
        if (cancelled) return;
        apply(next);
        if (next) void startSync();
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const needsOnboarding = !!me && !me.profile.onboarded && pathname !== "/onboarding";
  useEffect(() => {
    if (needsOnboarding) router.replace("/onboarding");
  }, [needsOnboarding, router]);

  const value = useMemo<AccountState | null>(() => {
    if (!me) return null;
    return {
      me,
      refresh: load,
      updateProfile: async (patch) => {
        setMe((m) => (m ? { ...m, profile: { ...m.profile, ...patch } } : m));
        const res = await fetch("/api/me", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) await load();
      },
      noteAnalysis: () => setMe((m) => (m ? { ...m, usage: { ...m.usage, used: m.usage.used + 1 } } : m)),
      promptUpgrade: setUpgrade,
    };
  }, [me, load]);

  if (!value || needsOnboarding) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <Orb palette="orchid" size={56} float="fast" />
        {failed ? (
          <>
            <p className="text-sm text-muted-foreground">We could not load your account. Check your connection.</p>
            <button type="button" onClick={() => void load()} className="text-sm font-medium underline underline-offset-4">
              Try again
            </button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground" role="status">
            Loading…
          </p>
        )}
      </div>
    );
  }

  return (
    <AccountContext.Provider value={value}>
      {children}
      <Dialog open={upgrade !== null} onOpenChange={(open) => !open && setUpgrade(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          {upgrade && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">{UPGRADE_COPY[upgrade].title}</DialogTitle>
                <DialogDescription>{UPGRADE_COPY[upgrade].body}</DialogDescription>
              </DialogHeader>
              <Pricing currentPlan={value.me.plan} trialAvailable={value.me.trialAvailable} paidOnly />
            </>
          )}
        </DialogContent>
      </Dialog>
    </AccountContext.Provider>
  );
}
