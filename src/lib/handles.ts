/**
 * Resolves a FOMO @handle to a Solana wallet so it can be analyzed with real data.
 * Order: 1) FOMO_HANDLE_MAP env (JSON, manual overrides), 2) FomoLens API if FOMOLENS_KEY is set
 * (third-party paid service, ~10 credits per lookup: https://fomolens.app/docs).
 * PLUG-IN POINT: swap in any other handle->wallet source here. Throwing a PublicError shows the user a clear message.
 * Note: the handle (without "@") is sent to the third-party service.
 */
const ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
import { DailyBudget, PublicError, shared } from "./guard";
const cache = shared("handleCache", () => new Map<string, string | null>()); // per server instance; avoids repeat paid lookups
// Each FomoLens lookup costs credits. Past this many NEW lookups per day we ask users to paste an address instead.
const lookupBudget = shared("lookupBudget", () => new DailyBudget(Number(process.env.FOMOLENS_DAILY_CAP) || 100));

export async function resolveHandle(handle: string): Promise<string | null> {
  const h = handle.replace(/^@/, "").toLowerCase();
  if (cache.has(h)) return cache.get(h)!;
  let wallet: string | null = null;
  try {
    const map = JSON.parse(process.env.FOMO_HANDLE_MAP || "{}") as Record<string, string>;
    const hit = Object.entries(map).find(([k]) => k.replace(/^@/, "").toLowerCase() === h)?.[1];
    if (hit && ADDR.test(hit)) wallet = hit;
  } catch { /* bad JSON: ignore */ }
  if (!wallet && process.env.FOMOLENS_KEY) {
    if (!lookupBudget.take()) throw new PublicError("FOMO handle lookups are at capacity today. Switch to “Solana address” and paste your FOMO wallet address instead.", 503);
    wallet = await lookupFomoLens(h);
  }
  if (!wallet) throw new PublicError(`Couldn't find a Solana wallet for @${h}. Check the handle, or switch to “Solana address” and paste your wallet.`, 404);
  if (wallet) cache.set(h, wallet); // don't cache misses, so a transient failure can recover
  return wallet;
}

async function lookupFomoLens(handle: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.fomolens.app/api/v1/users/${encodeURIComponent(handle)}/wallets`, {
      headers: { Authorization: `Bearer ${process.env.FOMOLENS_KEY}` },
      next: { revalidate: 604800 }, // Vercel data cache (free): a handle's wallet is looked up at most once a week
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) { console.error("FomoLens lookup failed:", res.status); return null; }
    const j = (await res.json()) as { mappings?: { walletFamily: string; walletAddress: string }[] };
    const w = j.mappings?.find((m) => m.walletFamily === "solana")?.walletAddress;
    return w && ADDR.test(w) ? w : null;
  } catch (e) {
    console.error("FomoLens lookup error:", e);
    return null;
  }
}
