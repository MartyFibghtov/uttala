"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, GraduationCap, Loader2, LogOut, Trash2, Trophy, UserMinus, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { scoreColor } from "@/components/practice-session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ClassDetail, ClassSummary, CommunityPrefs, League } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Community {
  prefs: CommunityPrefs;
  league: League;
  classes: ClassSummary[];
}

/** JSON request that turns an error response into a thrown, readable message. */
async function call<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
  return data;
}

const fail = (err: unknown) => toast.error(err instanceof Error ? err.message : "Something went wrong.");

const weekLabel = (start: string) =>
  `Week of ${new Date(`${start}T12:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "long" })}. Resets every Monday (UTC).`;

function Board({ rows }: { rows: { rank?: number; name: string; points: number; you: boolean }[] }) {
  return (
    <ol className="divide-y">
      {rows.map((r, i) => {
        const rank = r.rank ?? i + 1;
        return (
          <li key={`${rank}-${r.name}`} className={cn("flex items-center gap-3 py-2.5", r.you && "-mx-3 rounded-lg bg-secondary px-3")}>
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                rank === 1 ? "bg-amber-300 text-amber-950" : rank <= 3 ? "bg-secondary" : "text-muted-foreground",
              )}
            >
              {rank}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {r.name}
              {r.you && <span className="ml-2 text-xs font-normal text-muted-foreground">you</span>}
            </span>
            <span className="text-sm tabular-nums">{r.points.toLocaleString()}</span>
          </li>
        );
      })}
    </ol>
  );
}

function LeagueTab({ data, onChange }: { data: Community; onChange: (next: Partial<Community>) => void }) {
  const { prefs, league } = data;
  const [handle, setHandle] = useState(prefs.handle);
  const [busy, setBusy] = useState(false);

  const save = async (patch: Partial<CommunityPrefs>) => {
    setBusy(true);
    try {
      const saved = await call<CommunityPrefs>("/api/community", "PATCH", patch);
      const fresh = await call<Community>("/api/community");
      onChange({ ...fresh, prefs: saved });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  if (!prefs.league) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="size-4" />
            Join the weekly league
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            A fresh ranking every Monday, by points earned from analysed recordings. It is optional. If you join, other
            learners see the display name you choose here and your points for the week, nothing else.
          </p>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save({ handle, league: true });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="handle">Display name</Label>
              <Input id="handle" value={handle} onChange={(e) => setHandle(e.target.value)} maxLength={20} placeholder="e.g. Quiet Otter" autoComplete="off" />
              <p className="text-xs text-muted-foreground">2 to 20 characters. It does not have to be your real name.</p>
            </div>
            <Button type="submit" className="rounded-full" disabled={busy || handle.trim().length < 2}>
              {busy && <Loader2 className="animate-spin" />}
              Join the league
            </Button>
          </form>
          <p className="mt-4 text-sm text-muted-foreground tabular-nums">Your points this week so far: {league.yourPoints}</p>
        </CardContent>
      </Card>
    );
  }

  const mine = league.rows.find((r) => r.you);
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">This week</CardTitle>
          <p className="text-sm text-muted-foreground">{weekLabel(league.weekStart)}</p>
        </CardHeader>
        <CardContent>
          {league.rows.length ? (
            <Board rows={league.rows} />
          ) : (
            <p className="text-sm text-muted-foreground">Nobody has scored yet this week. One recording puts you on top.</p>
          )}
        </CardContent>
      </Card>
      <Card className="h-fit">
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Your place</p>
            <p className="text-4xl font-semibold tracking-tight tabular-nums">{mine ? `#${mine.rank}` : "–"}</p>
            <p className="mt-1 text-sm text-muted-foreground tabular-nums">
              {league.yourPoints} points as “{prefs.handle}”
              {!mine && league.yourPoints > 0 && ". Outside the top 50 for now."}
              {!mine && league.yourPoints === 0 && ". Record something to appear."}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Only recordings count here, 10 to 20 points each, so the ranking rewards speaking practice.
          </p>
          <Button variant="outline" size="sm" className="w-full rounded-full" disabled={busy} onClick={() => void save({ league: false })}>
            <LogOut />
            Leave the league
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ClassPanel({ id, onGone }: { id: string; onGone: () => void }) {
  const [detail, setDetail] = useState<ClassDetail | null>(null);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(() => call<ClassDetail>(`/api/classes/${id}`).then(setDetail).catch(fail), [id]);
  useEffect(() => {
    let cancelled = false;
    call<ClassDetail>(`/api/classes/${id}`)
      .then((d) => !cancelled && setDetail(d))
      .catch(fail);
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!detail || detail.id !== id) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading class…
        </CardContent>
      </Card>
    );
  }
  const owner = detail.role === "owner";
  const remove = async (memberId?: string) => {
    try {
      await call(`/api/classes/${id}${memberId ? `?member=${encodeURIComponent(memberId)}` : ""}`, "DELETE");
      if (memberId) await load();
      else onGone();
    } catch (err) {
      fail(err);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">{detail.name}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{weekLabel(detail.weekStart)}</p>
        </div>
        {owner && detail.code && (
          <Button
            variant="outline"
            size="sm"
            className="rounded-full font-mono tracking-widest"
            onClick={() => void navigator.clipboard.writeText(detail.code ?? "").then(() => toast.success("Join code copied."))}
          >
            <Copy />
            {detail.code}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {detail.roster.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nobody has joined yet. Share the code above; learners enter it under “Join a class”.
          </p>
        ) : owner ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Learner</th>
                  <th className="px-3 py-2 text-right font-medium">Points</th>
                  <th className="px-3 py-2 text-right font-medium">Recordings</th>
                  <th className="px-3 py-2 text-right font-medium">Average</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">Last active</th>
                  <th className="py-2 pl-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {detail.roster.map((m) => (
                  <tr key={m.id}>
                    <td className="max-w-40 truncate py-2.5 pr-3 font-medium">{m.name}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{m.points}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{m.recordings ?? 0}</td>
                    <td className={cn("px-3 py-2.5 text-right tabular-nums", m.average !== undefined && scoreColor(m.average))}>
                      {m.average ?? "–"}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                      {m.lastActive ? new Date(`${m.lastActive}T12:00:00Z`).toLocaleDateString(undefined, { dateStyle: "medium" }) : "Never"}
                    </td>
                    <td className="py-2.5 pl-3 text-right">
                      <Button variant="ghost" size="icon" className="size-8 rounded-full text-muted-foreground" aria-label={`Remove ${m.name}`} onClick={() => void remove(m.id)}>
                        <UserMinus className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted-foreground">Points, recordings and average sound score are for this week.</p>
          </div>
        ) : (
          <Board rows={detail.roster} />
        )}
        <div className="flex justify-end">
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">{owner ? "Delete this class for everyone?" : "Leave this class?"}</span>
              <Button size="sm" variant="destructive" className="rounded-full" onClick={() => void remove()}>
                Yes
              </Button>
              <Button size="sm" variant="outline" className="rounded-full" onClick={() => setConfirming(false)}>
                No
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="ghost" className="rounded-full text-muted-foreground" onClick={() => setConfirming(true)}>
              {owner ? <Trash2 /> : <LogOut />}
              {owner ? "Delete class" : "Leave class"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ClassesTab({ data, reload }: { data: Community; reload: () => Promise<void> }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const current = data.classes.find((c) => c.id === selected) ?? data.classes[0];

  const submit = async (url: string, body: unknown, done: string, reset: () => void) => {
    setBusy(true);
    try {
      const made = await call<ClassSummary>(url, "POST", body);
      await reload();
      setSelected(made.id);
      reset();
      toast.success(done);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="space-y-6">
        {data.classes.length > 0 && (
          <div className="space-y-2">
            {data.classes.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelected(c.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left transition-colors hover:bg-secondary",
                  current?.id === c.id && "border-foreground bg-secondary",
                )}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-background">
                  {c.role === "owner" ? <GraduationCap className="size-4" /> : <Users className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{c.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {c.role === "owner" ? "You teach this" : "Member"} · {c.members} learner{c.members === 1 ? "" : "s"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Join a class</CardTitle>
            <p className="text-sm text-muted-foreground">
              Enter the code from your teacher. Your teacher and classmates will see your account name and weekly
              points; your teacher also sees how many recordings you made, your average score and when you last
              practised. Your voice is never shared.
            </p>
          </CardHeader>
          <CardContent>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void submit("/api/classes/join", { code }, "You joined the class.", () => setCode(""));
              }}
            >
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="CODE"
                maxLength={8}
                aria-label="Class code"
                autoComplete="off"
                className="font-mono tracking-widest uppercase"
              />
              <Button type="submit" className="rounded-full" disabled={busy || code.trim().length < 6}>
                Join
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Teach a class</CardTitle>
            <p className="text-sm text-muted-foreground">
              Create a class, share its code, and follow who is practising. Free for teachers; learners use their own
              plan.
            </p>
          </CardHeader>
          <CardContent>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void submit("/api/classes", { name }, "Class created. Share the code with your learners.", () => setName(""));
              }}
            >
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tuesday evening B1" maxLength={60} aria-label="Class name" />
              <Button type="submit" variant="outline" className="rounded-full" disabled={busy || name.trim().length < 2}>
                Create
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="min-w-0">
        {current ? (
          <ClassPanel key={current.id} id={current.id} onGone={() => void reload().then(() => setSelected(null))} />
        ) : (
          <div className="rounded-xl border border-dashed px-6 py-12 text-center">
            <p className="font-medium">No classes yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Classes are small private groups: a teacher and their learners, a study group, or a few friends keeping
              each other honest. Join one with a code, or create your own.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function CommunityView() {
  const [data, setData] = useState<Community | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(
    () =>
      call<Community>("/api/community")
        .then((d) => {
          setData(d);
          setFailed(false);
        })
        .catch(() => setFailed(true)),
    [],
  );
  useEffect(() => {
    let cancelled = false;
    call<Community>("/api/community")
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <PageHeader
        title="Community"
        description="Practise alongside other people: a weekly league you can opt into, and private classes for teachers, study groups and friends."
      />
      {!data ? (
        <div className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
          {failed ? (
            <>
              Could not load the community.{" "}
              <button type="button" className="font-medium text-foreground underline underline-offset-4" onClick={() => void reload()}>
                Try again
              </button>
            </>
          ) : (
            <span role="status">Loading…</span>
          )}
        </div>
      ) : (
        <Tabs defaultValue={data.classes.length && !data.prefs.league ? "classes" : "league"}>
          <TabsList className="mb-4">
            <TabsTrigger value="league">League</TabsTrigger>
            <TabsTrigger value="classes">Classes{data.classes.length ? ` · ${data.classes.length}` : ""}</TabsTrigger>
          </TabsList>
          <TabsContent value="league">
            <LeagueTab data={data} onChange={(next) => setData({ ...data, ...next })} />
          </TabsContent>
          <TabsContent value="classes">
            <ClassesTab data={data} reload={reload} />
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}

/** Opt in or out of practice reminder emails. Used on the settings page. */
export function ReminderToggle() {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    call<Community>("/api/community")
      .then((d) => !cancelled && setOn(d.prefs.reminders))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const toggle = async () => {
    const next = !on;
    setOn(next);
    try {
      await call("/api/community", "PATCH", { reminders: next });
      toast.success(next ? "Reminders are on." : "Reminders are off.");
    } catch (err) {
      setOn(!next);
      fail(err);
    }
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <p className="max-w-xl text-sm text-muted-foreground">
        An email when you have not practised for two days, at most once every three days. Off unless you turn it on,
        and every email has a one-click link to stop.
      </p>
      <Button
        variant={on ? "default" : "outline"}
        className="rounded-full"
        role="switch"
        aria-checked={!!on}
        disabled={on === null}
        onClick={() => void toggle()}
      >
        {on ? "Reminders on" : "Turn on reminders"}
      </Button>
    </div>
  );
}
