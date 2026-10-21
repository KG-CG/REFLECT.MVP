import { NextResponse } from "next/server";
import { LIMITS, getTier } from "@/lib/tiers";

export const dynamic = "force-dynamic";

const ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Tells the UI which tier (and limits) a set of wallets gets, based on $REFLECT holdings. */
export async function POST(req: Request) {
  let body: { wallets?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const w = Array.isArray(body.wallets) ? body.wallets.filter((x): x is string => typeof x === "string" && ADDR.test(x)).slice(0, 10) : [];
  const tier = await getTier(w);
  return NextResponse.json({ tier, limits: LIMITS[tier] });
}
