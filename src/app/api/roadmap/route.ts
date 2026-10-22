import { NextResponse } from "next/server";
import { getTier } from "@/lib/tiers";
import { ROADMAP } from "@/lib/roadmap";

export const dynamic = "force-dynamic";
const ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Holders only: withheld server-side from everyone else. */
export async function POST(req: Request) {
  let body: { wallets?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const w = Array.isArray(body.wallets) ? body.wallets.filter((x): x is string => typeof x === "string" && ADDR.test(x)).slice(0, 10) : [];
  if ((await getTier(w)) !== "premium") return NextResponse.json({ error: "Holders only." }, { status: 403 });
  return NextResponse.json({ phases: ROADMAP });
}
