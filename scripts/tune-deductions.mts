/**
 * Calibrate deduction costs (src/lib/deductions.ts) on the latest gopcheck output.
 *
 *   npm run gopcheck && npm run tune-deductions
 *
 * Prints the current costs' results, then the best costs from a grid search, per-language medians and the
 * learner's own recordings. Copy the printed costs into COSTS by hand.
 */
import { readFileSync, readdirSync } from "node:fs";
import { deduct, COSTS, type Evidence } from "../src/lib/deductions";
const ROOT = ".data/realset";
interface Row { lang: string; group: string; source: string; human?: number; evidence: Evidence }
const rows = JSON.parse(readFileSync(`${ROOT}/${readdirSync(ROOT).filter((f) => f.startsWith("gopcheck-")).sort().pop()}`, "utf8")) as Row[];
const q = (a: number[], p: number) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const med = (a: number[]) => q(a, 0.5);
const pear = (x: number[], y: number[]) => { const n = x.length, mx = x.reduce((a, b) => a + b) / n, my = y.reduce((a, b) => a + b) / n; let a = 0, b = 0, c = 0; for (let i = 0; i < n; i++) { a += (x[i] - mx) * (y[i] - my); b += (x[i] - mx) ** 2; c += (y[i] - my) ** 2; } return a / Math.sqrt(b * c); };
function evaluate(costs: typeof COSTS) {
  const sc = (r: Row) => deduct(r.evidence as Evidence, costs).score;
  const g = (f: (r: Row) => boolean) => rows.filter(f).map(sc);
  const natRows = rows.filter((r) => r.group === "native" && r.source !== "so762");
  const nat = natRows.map(sc);
  const light = g((r) => r.group === "light"), heavy = g((r) => r.group === "heavy"), foreign = g((r) => r.group === "say-foreign");
  const so = rows.filter((r) => r.source === "so762");
  return { natMed: med(nat), natShare85: +(nat.filter((x) => x >= 85).length / nat.length).toFixed(2),
    natLenCorr: +pear(natRows.map((r) => r.evidence.sounds.length), nat).toFixed(2),
    light: med(light), heavy, heavyMax: Math.max(...heavy), foreignMed: med(foreign), foreignShare60: +(foreign.filter((x) => x >= 60).length / foreign.length).toFixed(2),
    so: +pear(so.map(sc), so.map((r) => r.human ?? 0)).toFixed(3), soTop: med(so.filter((r) => (r.human ?? 0) >= 9).map(sc)), soLow: med(so.filter((r) => (r.human ?? 0) <= 6).map(sc)) };
}
console.log("before (current costs):", JSON.stringify(evaluate(COSTS)));
let best: { loss: number; c: typeof COSTS; e: ReturnType<typeof evaluate> } | null = null;
for (const sw of [2, 3, 4, 5, 6]) for (const sk of [0.75, 1, 1.5, 2]) for (const ww of [2, 3, 4, 5]) for (const pause of [1.5, 2, 3]) for (const pm of [0.3, 0.4, 0.6]) {
  const c = { ...COSTS, soundWrong: sw, soundWeak: sk, wordWrong: ww, wordUnclear: ww / 2, pause, rhythm: +(pm * 0.8).toFixed(2), melody: pm };
  const e = evaluate(c);
  const loss = Math.max(0, 0.9 - e.natShare85) * 100 + Math.max(0, e.heavyMax - 59) * 2 + Math.max(0, e.foreignMed - 40) + e.foreignShare60 * 30 + Math.max(0, 75 - e.light) + Math.max(0, e.light - 90) + (0.8 - e.so) * 50;
  if (!best || loss < best.loss) best = { loss, c, e };
}
if (!best) throw new Error("no rows");
const { soundWrong, soundWeak, wordWrong, wordUnclear, pause, rhythm, melody } = best.c;
console.log("best costs:", JSON.stringify({ soundWrong, soundWeak, wordWrong, wordUnclear, pause, rhythm, melody }));
console.log("after:", JSON.stringify(best.e));
for (const l of ["en", "de", "es", "ru", "sv"]) {
  const line = [l];
  for (const grp of ["native", "light", "heavy", "learner", "say-native", "say-foreign"]) {
    const s = rows.filter((r) => r.lang === l && r.group === grp && r.source !== "so762").map((r) => deduct(r.evidence, best!.c).score);
    if (s.length) line.push(`${grp} ${med(s)} (${Math.min(...s)}–${Math.max(...s)})`);
  }
  console.log(line.join("  |  "));
}
const u = rows.find((r) => r.source === "user");
if (!u) process.exit(0);
const d = deduct(u.evidence, best.c);
console.log(`\nyour clip (${u.evidence.sounds.length} sounds, ${u.evidence.words.length} words): ${d.score}`);
const by: Record<string, number> = {}; for (const i of d.items) by[i.kind] = (by[i.kind] ?? 0) + i.points;
console.log(JSON.stringify(by));
