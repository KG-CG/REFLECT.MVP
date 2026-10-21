import { NextResponse } from "next/server";
import { getPositions, getSolUsd } from "@/lib/helius";
import { buildReport, buildResult } from "@/lib/analyze";
import { llmJournal } from "@/lib/llm";
import { LIMITS, getTier } from "@/lib/tiers";
import { DailyBudget, isPublicError, priorityContext, shared } from "@/lib/guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // deep history scans make several sequential Helius calls

const ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/; // base58 Solana address
const HANDLE = /^@\w{2,30}$/;
const norm = (s: string) => { const t = s.trim(); return ADDR.test(t) || t.startsWith("@") ? t : `@${t}`; }; // bare handle -> @handle
const short = (a: string) => (a.startsWith("@") ? a : `${a.slice(0, 4)}…${a.slice(-4)}`);
// Best-effort per-IP limit (in-memory, so per server instance). Each analysis spends Helius/FomoLens quota.
// For real protection on Vercel, swap this for Upstash/Vercel KV rate limiting.
const hits = shared("hits", () => new Map<string, number[]>());
function hitCount(ip: string, windowMs = 60_000) {
  const now = Date.now(), recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  recent.push(now); hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return recent.length;
}
// Global daily cap on analyses so a traffic spike can't drain free Helius quota.
const dailyAnalyses = shared("dailyAnalyses", () => new DailyBudget(Number(process.env.DAILY_ANALYSIS_CAP) || 400));
const holderReserve = shared("holderReserve", () => new DailyBudget(Number(process.env.HOLDER_RESERVE_CAP) || 200));
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const hitsNow = hitCount(ip); // counted before any upstream work; free callers get 6/min, holders 20/min
  if (hitsNow > 20) return bad("Too many requests. Please wait a minute and try again.", 429);
  let body: { wallets?: unknown; fomo?: unknown };
  try { body = await req.json(); } catch { return bad("Invalid request body."); }
  const strs = (v: unknown) => (Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : null);
  const wallets = strs(body.wallets ?? [])?.map(norm), fomo = strs(body.fomo ?? [])?.map(norm);
  if (!wallets || !fomo) return bad("wallets and fomo must be arrays of strings.");
  // Addresses end up in an upstream URL, so validate strictly server-side.
  if (!wallets.every((w) => ADDR.test(w) || HANDLE.test(w))) return bad("Invalid wallet address or FOMO handle.");
  if (!fomo.every((f) => ADDR.test(f) || HANDLE.test(f))) return bad("Invalid FOMO wallet or handle.");
  if (wallets.length < 1) return bad("Add at least one wallet.");

  const tier = await getTier(wallets), holder = tier === "premium"; // server-side enforcement; never trust the client alone
  if (!holder && hitsNow > 6) return bad("Too many requests. Please wait a minute and try again.", 429);
  const lim = LIMITS[tier];
  if (wallets.length > lim.personal || fomo.length > lim.fomo) return bad("Free tier limit reached. $REFLECT holders get more.", 403);

  // Holders can also draw on a reserved pool, so they still get in after the free daily cap is used up.
  if (!dailyAnalyses.take() && !(holder && holderReserve.take())) return bad("Reflect is at capacity for today (free-plan limits). Please come back tomorrow.", 503);
  return priorityContext.run(holder, async () => {
  try {
    const mine = await Promise.all(wallets.map((w) => getPositions(w))); // multiple wallets merge into one profile
    const me = buildReport(mine.flatMap((r) => r.positions), `${wallets.length} wallet(s)`, "helius");
    const others = await Promise.all(fomo.map(async (a) => { const r = await getPositions(a); return buildReport(r.positions, short(a), r.source); }));
    return NextResponse.json(buildResult(me, others, await llmJournal(me), await getSolUsd()));
  } catch (e) {
    if (isPublicError(e)) return bad(e.message, e.status);
    console.error("analyze failed:", e);
    return bad("Something went wrong analyzing that wallet. Please try again.", 500);
  }
  });
}
