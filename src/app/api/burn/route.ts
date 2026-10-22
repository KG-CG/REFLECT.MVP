import { NextResponse } from "next/server";
import { REFLECT_MINT, getTier } from "@/lib/tiers";
import { burnPlan } from "@/lib/burn";

export const dynamic = "force-dynamic";
const ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

async function marketCap(): Promise<number | null> {
  const mint = REFLECT_MINT;
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, { next: { revalidate: 60 }, signal: AbortSignal.timeout(6000) });
    const p = (await r.json())?.pairs?.[0];
    return Number(p?.marketCap ?? p?.fdv) || null;
  } catch { return null; }
}

const DEV_WALLET = process.env.DEV_WALLET || "7fTcDaVP7vh7bNRa5v3cZX2vMa3yfasj8XkVsn97kJLk";
let devCache: { at: number; v: number } | null = null;

/** Live REFLECT balance of the dev supply wallet (5-min cache); falls back to the burn.ts default. */
async function devSupply(): Promise<number | undefined> {
  if (process.env.DEV_SUPPLY) return undefined;
  if (devCache && Date.now() - devCache.at < 300_000) return devCache.v;
  const key = process.env.HELIUS_API_KEY;
  if (!key) return undefined;
  try {
    const r = await fetch(`https://mainnet.helius-rpc.com/?api-key=${key}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTokenAccountsByOwner", params: [DEV_WALLET, { mint: REFLECT_MINT }, { encoding: "jsonParsed" }] }),
    });
    const j = await r.json();
    const v = Math.floor((j?.result?.value ?? []).reduce((n: number, a: any) => n + (Number(a?.account?.data?.parsed?.info?.tokenAmount?.uiAmount) || 0), 0));
    if (v > 0) { devCache = { at: Date.now(), v }; return v; }
  } catch {}
  return undefined;
}

/** Holders only: the plan is withheld from everyone else, so hiding it in the UI isn't the only protection. */
export async function POST(req: Request) {
  let body: { wallets?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const w = Array.isArray(body.wallets) ? body.wallets.filter((x): x is string => typeof x === "string" && ADDR.test(x)).slice(0, 10) : [];
  if ((await getTier(w)) !== "premium") return NextResponse.json({ error: "Holders only." }, { status: 403 });
  return NextResponse.json({ ...burnPlan(await devSupply()), currentMcap: await marketCap() });
}
