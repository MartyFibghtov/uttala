"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AudioWaveform, BookOpen, ChartLine, ChevronsUpDown, Flame, Headphones, House, LogOut, Mic, Settings, Target, Users } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { useAccount } from "@/hooks/use-account";
import { authClient } from "@/lib/auth-client";
import { ACHIEVEMENTS, isUnlocked } from "@/lib/gamification";
import { PLANS } from "@/lib/plans";
import { useOverview } from "@/lib/stats";
import { isDue, markBadgesSeen, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/home", label: "Home", icon: House, mobile: true },
  { href: "/learn", label: "Learn", icon: BookOpen, mobile: true },
  { href: "/practice", label: "Practice", icon: Mic, mobile: true },
  { href: "/shadowing", label: "Shadowing", icon: Headphones, mobile: true },
  { href: "/drills", label: "Drills", icon: Target, mobile: true },
  { href: "/sounds", label: "Sounds", icon: AudioWaveform, mobile: false },
  { href: "/progress", label: "Progress", icon: ChartLine, mobile: true },
  { href: "/community", label: "Community", icon: Users, mobile: false },
];

/** Words waiting in the drill list for the current language. */
function useDueCount() {
  const { me } = useAccount();
  const weak = useStore("weak");
  return weak.filter((w) => w.lang === me.profile.lang && isDue(w)).length;
}

/** Announces achievements the first time they are earned. Renders nothing. */
function AchievementWatcher() {
  const overview = useOverview();
  const seen = useStore("badges");
  useEffect(() => {
    const fresh = ACHIEVEMENTS.filter((a) => !seen.includes(a.id) && isUnlocked(a, overview));
    if (!fresh.length) return;
    markBadgesSeen(fresh.map((a) => a.id));
    for (const a of fresh.slice(0, 3)) toast.success(`Achievement: ${a.title}`, { description: a.detail });
  }, [overview, seen]);
  return null;
}

/** Streak and rank at a glance. */
function StreakCard() {
  const o = useOverview();
  const done = o.today.xp >= o.goal;
  return (
    <Link href="/progress" className="block space-y-2 rounded-xl border bg-background p-3 transition-colors hover:bg-sidebar-accent">
      <div className="flex items-center justify-between gap-2 text-xs whitespace-nowrap">
        <span className="flex items-center gap-1.5 font-medium">
          <Flame className={cn("size-3.5", o.streak > 0 ? "text-orange-500" : "text-muted-foreground")} />
          {o.streak}-day streak
        </span>
        <span className="tabular-nums text-muted-foreground">
          {Math.min(o.today.xp, o.goal)} / {o.goal}
        </span>
      </div>
      <Progress value={Math.min(100, (o.today.xp / o.goal) * 100)} className="h-1.5" aria-label="Today's goal" />
      <p className="text-xs text-muted-foreground">
        {done ? "Goal reached today" : "Today's goal"} · Rank {o.rank.level}, {o.rank.name}
      </p>
    </Link>
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="flex h-6 items-center gap-[3px]" aria-hidden>
        {[10, 18, 24, 14].map((h, i) => (
          <span key={i} className="w-[3px] rounded-full bg-foreground" style={{ height: h }} />
        ))}
      </span>
      Uttala
    </Link>
  );
}

async function signOut() {
  await authClient.signOut();
  window.location.assign("/");
}

/** Today's allowance, with the upgrade path for people on the free plan. */
function UsageCard() {
  const { me, promptUpgrade } = useAccount();
  const left = Math.max(0, me.usage.limit - me.usage.used);
  const free = me.plan === "free" && me.billing;
  return (
    <div className="space-y-2.5 rounded-xl border bg-background p-3">
      <div className="flex items-baseline justify-between gap-2 text-xs whitespace-nowrap">
        <span className="font-medium">{me.billing ? `${PLANS[me.plan].name} plan` : "Recordings"}</span>
        <span className="tabular-nums text-muted-foreground">
          {left} left today
        </span>
      </div>
      <Progress value={(left / me.usage.limit) * 100} className="h-1.5" aria-label="Recordings left today" />
      {free && (
        <Button size="sm" className="w-full rounded-full" onClick={() => promptUpgrade(left ? "prosody" : "limit")}>
          {me.trialAvailable ? "Try Plus free" : "Upgrade"}
        </Button>
      )}
    </div>
  );
}

function UserMenu({ compact }: { compact?: boolean }) {
  const { me } = useAccount();
  const initial = (me.user.name || me.user.email).trim().charAt(0).toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className={cn(
            "flex items-center gap-2.5 rounded-lg text-left transition-colors hover:bg-sidebar-accent",
            compact ? "p-1" : "w-full px-2 py-1.5",
          )}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-medium text-background">
            {initial}
          </span>
          {!compact && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{me.user.name || "Account"}</span>
                <span className="block truncate text-xs text-muted-foreground">{me.user.email}</span>
              </span>
              <ChevronsUpDown className="size-4 text-muted-foreground" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={compact ? "end" : "start"} className="w-56">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{me.user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account">
            <Settings />
            Settings and billing
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/assessment">
            <Target />
            Checkpoint test
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const due = useDueCount();
  const overview = useOverview();

  // Onboarding is a focused, full-page flow without navigation.
  if (pathname === "/onboarding") {
    return (
      <div className="min-h-dvh">
        <div className="aurora-line" />
        {children}
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <AchievementWatcher />
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col overflow-y-auto border-r bg-sidebar p-4 md:flex">
        <div className="px-2 py-1.5">
          <Logo href="/home" />
        </div>
        <nav className="mt-6 flex flex-col gap-0.5" aria-label="Main">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
                isActive(href) && "bg-sidebar-accent text-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
              {href === "/drills" && due > 0 && (
                <span className="ml-auto rounded-full bg-foreground px-1.5 py-0.5 text-[10px] leading-none font-semibold text-background tabular-nums">
                  {due}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-3 pt-6">
          <StreakCard />
          <UsageCard />
          <UserMenu />
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-background/90 px-4 py-2 backdrop-blur md:hidden">
        <Logo href="/home" />
        <div className="flex items-center gap-2">
          <Link
            href="/progress"
            className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums"
            aria-label={`${overview.streak}-day streak`}
          >
            <Flame className={cn("size-3.5", overview.streak > 0 ? "text-orange-500" : "text-muted-foreground")} />
            {overview.streak}
          </Link>
          <Link
            href="/sounds"
            aria-label="Sounds"
            className={cn("rounded-full p-1.5 text-muted-foreground", isActive("/sounds") && "bg-secondary text-foreground")}
          >
            <AudioWaveform className="size-4" />
          </Link>
          <Link
            href="/community"
            aria-label="Community"
            className={cn("rounded-full p-1.5 text-muted-foreground", isActive("/community") && "bg-secondary text-foreground")}
          >
            <Users className="size-4" />
          </Link>
          <UserMenu compact />
        </div>
      </header>

      <main className="min-w-0 flex-1 pb-20 md:pb-0">
        <div className="aurora-line" />
        <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</div>
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-6 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {NAV.filter((n) => n.mobile).map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? "page" : undefined}
            className={cn(
              "relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground",
              isActive(href) && "text-foreground",
            )}
          >
            <Icon className="size-5" />
            {label}
            {href === "/drills" && due > 0 && (
              <span className="absolute top-1.5 left-1/2 ml-2 size-2 rounded-full bg-orange-500" aria-label={`${due} due`} />
            )}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function PageHeader({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
