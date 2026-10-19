import type { Position } from "./types";
import { resolveHandle } from "./handles";
import { Limiter, PublicError, TtlCache, dedupe, shared } from "./guard";

interface Fill { ts: number; token: string; side: "buy" | "sell"; sol: number; qty: number }

/**
 * How many transactions to scan per wallet (100 per Helius request). The scan stops earlier when the wallet's
 * history ends or the time budget runs out, so win rate covers all available data within these limits.
 */
const MAX_TXS = Math.min(5000, Math.max(100, Number(process.env.HELIUS_MAX_TXS) || 2000));
const SCAN_BUDGET_MS = 40_000; // keeps us inside Vercel's function limit

/**
 * Returns positions for an address. Uses Helius "enhanced transactions" when HELIUS_API_KEY is set.
 * There is no sample data: every failure throws a PublicError so users never see made-up numbers.
 * Trades are detected from the wallet's NET token flow in each transaction (see netFill), so it works for
 * SOL-, USDC- and USDT-quoted trades, pump.fun, aggregators and smart wallets such as FOMO's.
 * Free-plan protections: 10-minute result cache, shared in-flight scans, capped Helius concurrency, 429 retries.
 */
type Result = { positions: Position[]; source: "helius" };
const resultCache = shared("positions", () => new TtlCache<Result>(20 * 60_000));
const heliusLimiter = shared("heliusLimiter", () => new Limiter(Number(process.env.HELIUS_CONCURRENCY) || 3));

export async function getPositions(address: string): Promise<Result> {
  const key = process.env.HELIUS_API_KEY;
  if (!key) throw new PublicError("Reflect is not configured yet (missing HELIUS_API_KEY).", 503);
  if (address.startsWith("@")) address = (await resolveHandle(address))!; // throws PublicError if unresolved
  const cached = resultCache.get(address);
  if (cached) return cached;
  return dedupe(`pos:${address}`, async () => {
    const [txs, solUsd] = await Promise.all([fetchTransactions(address, key), getSolUsd()]);
    const positions = await priceOpenPositions(await nameTokens(fillsToPositions(toFills(txs, address, solUsd))));
    if (!positions.length) throw new PublicError("No completed swaps found in this wallet's recent history.", 404);
    const r: Result = { positions, source: "helius" };
    resultCache.set(address, r);
    return r;
  });
}

/** Pages backwards through the wallet's history (no type filter: many real trades are labelled TRANSFER/UNKNOWN). */
async function fetchTransactions(address: string, key: string): Promise<any[]> {
  const out: any[] = [];
  let before = "";
  const started = Date.now();
  while (out.length < MAX_TXS && Date.now() - started < SCAN_BUDGET_MS) {
    const res = await heliusGet(`https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${key}&limit=100${before ? `&before=${before}` : ""}`);
    if (!res.ok) { if (out.length) break; throw heliusError(res.status); }
    const page = await res.json();
    if (!Array.isArray(page) || !page.length) break;
    out.push(...page);
    before = page[page.length - 1].signature;
    if (page.length < 100) break;
  }
  return out;
}

const SOL_MINT = "So11111111111111111111111111111111111111112";
const STABLES = new Set(["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"]); // USDC, USDT

function toFills(txs: any[], wallet: string, solUsd: number | null): Fill[] {
  const fills: Fill[] = [];
  for (const tx of txs) { const f = netFill(tx, wallet, solUsd); if (f) fills.push(f); }
  return fills.sort((a, b) => a.ts - b.ts);
}

/**
 * Turns one transaction into a buy or sell, using the wallet's net token movements:
 * exactly one non-quote mint must move, against stablecoins and/or SOL going the other way.
 * Cost/proceeds only count quote flows opposite to the token flow, so route leftovers and rent refunds
 * are ignored; platform fees paid in the quote asset are included. Stablecoins are converted to SOL at the
 * CURRENT SOL price (approximation: win rate and hold times are unaffected, absolute PnL is approximate).
 */
function netFill(tx: any, wallet: string, solUsd: number | null): Fill | null {
  const net = new Map<string, number>();
  for (const t of tx.tokenTransfers ?? []) {
    const amt = Number(t.tokenAmount) || 0;
    if (t.fromUserAccount === wallet) net.set(t.mint, (net.get(t.mint) ?? 0) - amt);
    if (t.toUserAccount === wallet) net.set(t.mint, (net.get(t.mint) ?? 0) + amt);
  }
  const base = [...net].filter(([m, v]) => !STABLES.has(m) && m !== SOL_MINT && Math.abs(v) > 0);
  if (base.length !== 1) return null; // not a swap, or ambiguous (multi-token)
  const [mint, qty] = base[0];
  const nativeNet = (tx.nativeTransfers ?? []).reduce((s: number, t: any) => s + (t.toUserAccount === wallet ? t.amount : 0) - (t.fromUserAccount === wallet ? t.amount : 0), 0) / 1e9;
  const stableNet = [...net].filter(([m]) => STABLES.has(m)).reduce((s, [, v]) => s + v, 0);
  const solNet = (net.get(SOL_MINT) ?? 0) + nativeNet;
  let sol = 0;
  if (solNet !== 0 && Math.sign(solNet) !== Math.sign(qty)) sol += Math.abs(solNet);
  if (stableNet !== 0 && Math.sign(stableNet) !== Math.sign(qty)) { if (!solUsd) return null; sol += Math.abs(stableNet) / solUsd; }
  if (!sol || (solUsd && sol * solUsd < 0.5)) return null; // ignore dust
  return { ts: tx.timestamp * 1000, token: mint, side: qty > 0 ? "buy" : "sell", sol, qty: Math.abs(qty) };
}

/** Group fills per token into positions. A position closes once ~all bought tokens are sold. */
function fillsToPositions(fills: Fill[]): Position[] {
  const out: Position[] = [], open = new Map<string, Position & { bought: number; sold: number; lastPx: number }>();
  for (const f of fills) {
    const p = open.get(f.token), px = f.sol / f.qty;
    if (f.side === "buy") {
      if (!p) open.set(f.token, { token: f.token.slice(0, 4), entryTs: f.ts, exitTs: null, costSol: f.sol, proceedsSol: 0, adds: 0, addsLower: 0, mint: f.token, bought: f.qty, sold: 0, lastPx: px });
      else { p.costSol += f.sol; p.bought += f.qty; p.adds++; if (px < p.lastPx) p.addsLower++; p.lastPx = px; }
    } else if (p) { // sells with no matching buy in our window are ignored
      p.proceedsSol += f.sol; p.sold += f.qty;
      if (p.sold >= p.bought * 0.95) { p.exitTs = f.ts; const { bought, sold, lastPx, ...pos } = p; out.push(pos); open.delete(f.token); }
    }
  }
  for (const p of open.values()) { const { bought, sold, lastPx, ...pos } = p; out.push({ ...pos, openQty: Math.max(0, bought - sold) }); } // still open
  return out.sort((a, b) => a.entryTs - b.entryTs);
}

let solCache: { v: number; at: number } | null = null;
/** Current SOL/USD from Jupiter (cached 60s). Null if unavailable. */
export async function getSolUsd(): Promise<number | null> {
  if (solCache && Date.now() - solCache.at < 60000) return solCache.v;
  try {
    const res = await fetch(`https://lite-api.jup.ag/price/v3?ids=${SOL_MINT}`, { cache: "no-store" });
    const v = res.ok ? ((await res.json())[SOL_MINT]?.usdPrice as number | undefined) : undefined;
    if (v) solCache = { v, at: Date.now() };
    return v ?? null;
  } catch { return null; }
}

/** Marks open positions to market with Jupiter's public price API. Silently skips if unavailable. */
async function priceOpenPositions(ps: Position[]): Promise<Position[]> {
  const open = ps.filter((p) => !p.exitTs && p.mint && p.openQty);
  if (!open.length) return ps;
  try {
    const ids = [SOL_MINT, ...new Set(open.map((p) => p.mint!))].slice(0, 50).join(",");
    const res = await fetch(`https://lite-api.jup.ag/price/v3?ids=${ids}`, { cache: "no-store" });
    if (!res.ok) return ps;
    const prices = (await res.json()) as Record<string, { usdPrice?: number }>;
    const solUsd = prices[SOL_MINT]?.usdPrice;
    if (!solUsd) return ps;
    for (const p of open) { const usd = prices[p.mint!]?.usdPrice; if (usd) p.markSol = (p.openQty! * usd) / solUsd; }
  } catch { /* unrealized PnL is optional */ }
  return ps;
}

/** GET through the shared limiter; retries rate-limit (429) and transient 5xx responses with backoff. */
async function heliusGet(url: string): Promise<Response> {
  let res!: Response;
  for (let i = 0; i < 3; i++) {
    try {
      res = await heliusLimiter.run(() => fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) }));
    } catch { if (i === 2) throw new PublicError("Helius timed out. Please try again in a moment.", 504); continue; }
    if (res.status !== 429 && res.status < 500) return res;
    await new Promise((r) => setTimeout(r, 700 * (i + 1)));
  }
  return res;
}

function heliusError(status: number) {
  if (status === 429) return new PublicError("The data provider is busy right now (free-plan rate limit). Please retry in a minute.", 503);
  if (status === 401 || status === 403) return new PublicError("Data provider quota exhausted or key invalid. Please try again later.", 503);
  return new PublicError(`Couldn't load wallet history (provider error ${status}). Please try again.`, 502);
}

const symbols = shared("symbols", () => new Map<string, string>()); // mint -> ticker, never changes so cache forever
const shortMint = (m: string) => `${m.slice(0, 4)}…${m.slice(-4)}`;

/** Looks up real ticker symbols (free Jupiter token API, no key). Unknown/rugged tokens fall back to a short mint. */
async function nameTokens(ps: Position[]): Promise<Position[]> {
  const need = [...new Set(ps.map((p) => p.mint!).filter((m) => m && !symbols.has(m)))];
  for (let i = 0; i < need.length; i += 100) {
    const chunk = need.slice(i, i + 100);
    try {
      const res = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${chunk.join(",")}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (res.ok) for (const t of (await res.json()) as { id: string; symbol?: string }[]) if (t.symbol) symbols.set(t.id, t.symbol);
    } catch { /* names are cosmetic */ }
  }
  for (const p of ps) if (p.mint) p.symbol = symbols.get(p.mint) ?? shortMint(p.mint);
  return ps;
}
