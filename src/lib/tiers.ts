import { shared, TtlCache } from "./guard";

/**
 * ACCESS CONTROL: holding $REFLECT unlocks the premium tier.
 * Set REFLECT_TOKEN_MINT (the token's mint address) to turn detection on; without it everyone is "free".
 * REFLECT_MIN_BALANCE (default 1) is the minimum token amount that counts as an open position.
 * Premium also gets priority: its own request line, a higher rate limit and a reserved daily capacity.
 */
export { LIMITS, type Tier } from "./limits";
import type { Tier } from "./limits";

const ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const cache = shared("holderCache", () => new TtlCache<boolean>(5 * 60_000, 2000));

async function holdsReflect(owner: string): Promise<boolean> {
  const mint = process.env.REFLECT_TOKEN_MINT, key = process.env.HELIUS_API_KEY;
  if (!mint || !key || !ADDR.test(owner)) return false;
  const hit = cache.get(owner);
  if (hit !== undefined) return hit;
  try {
    const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${key}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTokenAccountsByOwner", params: [owner, { mint }, { encoding: "jsonParsed" }] }),
    });
    if (!res.ok) return false; // not cached, so a transient failure doesn't lock a holder out
    const j = await res.json();
    const min = Number(process.env.REFLECT_MIN_BALANCE) || 1;
    const total = (j?.result?.value ?? []).reduce((n: number, a: any) => n + (Number(a?.account?.data?.parsed?.info?.tokenAmount?.uiAmount) || 0), 0);
    const ok = total >= min;
    cache.set(owner, ok);
    return ok;
  } catch { return false; }
}

/** Premium if ANY of the given wallet addresses holds $REFLECT. FOMO handles (@name) are skipped. */
export async function getTier(wallets: string[] = []): Promise<Tier> {
  const addrs = [...new Set(wallets.filter((w) => ADDR.test(w)))].slice(0, 10);
  return (await Promise.all(addrs.map(holdsReflect))).some(Boolean) ? "premium" : "free";
}
