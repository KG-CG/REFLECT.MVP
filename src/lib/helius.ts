import type { Position } from "./types";
import { mockPositions } from "./mock";

interface Fill { ts: number; token: string; side: "buy" | "sell"; sol: number; qty: number }

/**
 * Returns positions for an address. Uses Helius "enhanced transactions" when HELIUS_API_KEY is set,
 * otherwise (or on any error) falls back to mock data so the app always works.
 * LIMITATION: only SOL-paired swaps are parsed (USDC pairs are ignored). Extend toFills() to add them.
 */
export async function getPositions(address: string): Promise<{ positions: Position[]; source: "helius" | "mock" }> {
  const key = process.env.HELIUS_API_KEY;
  if (!key || address.startsWith("@")) return { positions: mockPositions(address), source: "mock" }; // handles = mock for now
  try {
    const res = await fetch(`https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${key}&type=SWAP&limit=100`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Helius ${res.status}`);
    const positions = fillsToPositions(toFills(await res.json()));
    return positions.length ? { positions, source: "helius" } : { positions: mockPositions(address), source: "mock" };
  } catch (e) {
    console.error("Helius fetch failed, using mock:", e);
    return { positions: mockPositions(address), source: "mock" };
  }
}

function toFills(txs: any[]): Fill[] {
  const fills: Fill[] = [];
  for (const tx of txs) {
    const s = tx.events?.swap; if (!s) continue;
    const ts = tx.timestamp * 1000;
    const q = (t: any) => Number(t.rawTokenAmount.tokenAmount) / 10 ** t.rawTokenAmount.decimals;
    if (s.nativeInput && s.tokenOutputs?.[0]) // SOL -> token = buy
      fills.push({ ts, token: s.tokenOutputs[0].mint, side: "buy", sol: Number(s.nativeInput.amount) / 1e9, qty: q(s.tokenOutputs[0]) });
    else if (s.tokenInputs?.[0] && s.nativeOutput) // token -> SOL = sell
      fills.push({ ts, token: s.tokenInputs[0].mint, side: "sell", sol: Number(s.nativeOutput.amount) / 1e9, qty: q(s.tokenInputs[0]) });
  }
  return fills.sort((a, b) => a.ts - b.ts);
}

/** Group fills per token into positions. A position closes once ~all bought tokens are sold. */
function fillsToPositions(fills: Fill[]): Position[] {
  const out: Position[] = [], open = new Map<string, Position & { bought: number; sold: number; lastPx: number }>();
  for (const f of fills) {
    const p = open.get(f.token), px = f.sol / f.qty;
    if (f.side === "buy") {
      if (!p) open.set(f.token, { token: f.token.slice(0, 4), entryTs: f.ts, exitTs: null, costSol: f.sol, proceedsSol: 0, adds: 0, addsLower: 0, bought: f.qty, sold: 0, lastPx: px });
      else { p.costSol += f.sol; p.bought += f.qty; p.adds++; if (px < p.lastPx) p.addsLower++; p.lastPx = px; }
    } else if (p) { // sells with no matching buy in our window are ignored
      p.proceedsSol += f.sol; p.sold += f.qty;
      if (p.sold >= p.bought * 0.95) { p.exitTs = f.ts; const { bought, sold, lastPx, ...pos } = p; out.push(pos); open.delete(f.token); }
    }
  }
  for (const p of open.values()) { const { bought, sold, lastPx, ...pos } = p; out.push(pos); } // still open
  // TODO: unrealized PnL — price open tokens via Jupiter Price API and add to metrics.
  return out.sort((a, b) => a.entryTs - b.entryTs);
}
