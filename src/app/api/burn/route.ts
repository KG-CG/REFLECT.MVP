import { NextResponse } from "next/server";
import { getTier } from "@/lib/tiers";
import { burnPlan } from "@/lib/burn";

export const dynamic = "force-dynamic";
const ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

async function marketCap(): Promise<number | null> {
  const mint = process.env.REFLECT_TOKEN_MINT;
  if (!mint) return null;
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, { next: { revalidate: 60 }, signal: AbortSignal.timeout(6000) });
    const p = (await r.json())?.pairs?.[0];
    return Number(p?.marketCap ?? p?.fdv) || null;
  } catch { return null; }
}

/** Holders only: the plan is withheld from everyone else, so hiding it in the UI isn't the only protection. */
export async function POST(req: Request) {
  let body: { wallets?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const w = Array.isArray(body.wallets) ? body.wallets.filter((x): x is string => typeof x === "string" && ADDR.test(x)).slice(0, 10) : [];
  if ((await getTier(w)) !== "premium") return NextResponse.json({ error: "Holders only." }, { status: 403 });
  return NextResponse.json({ ...burnPlan(), currentMcap: await marketCap() });
}
