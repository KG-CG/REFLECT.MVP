import { NextResponse } from "next/server";
import { getPositions } from "@/lib/helius";
import { buildReport, buildResult } from "@/lib/analyze";
import { LIMITS, getTier } from "@/lib/tiers";

const short = (a: string) => (a.startsWith("@") ? a : `${a.slice(0, 4)}…${a.slice(-4)}`);

export async function POST(req: Request) {
  const { wallets = [], fomo = [] } = (await req.json()) as { wallets: string[]; fomo: string[] };
  const lim = LIMITS[getTier()]; // server-side enforcement; never trust the client alone
  if (wallets.length < 1) return NextResponse.json({ error: "Add at least one wallet." }, { status: 400 });
  if (wallets.length > lim.personal || fomo.length > lim.fomo) return NextResponse.json({ error: "Free tier limit reached. $REFLECT holders get more." }, { status: 403 });

  const mine = await Promise.all(wallets.map(getPositions)); // multiple wallets are merged into one profile
  const me = buildReport(mine.flatMap((r) => r.positions), `${wallets.length} wallet(s)`, mine[0].source);
  const others = await Promise.all(fomo.map(async (a) => { const r = await getPositions(a); return buildReport(r.positions, short(a), r.source); }));
  return NextResponse.json(buildResult(me, others));
}
