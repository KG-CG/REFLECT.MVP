import type { Position } from "./types";
const TOKENS = ["BONKISH", "WIFHAT", "POPCAT2", "MOODENG", "GIGA", "FWOG", "PNUT", "SOLCAT"];
function rng(seed: number) { // small deterministic PRNG so each address gets stable fake data
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

/** Fake but realistic positions. Swap for real data by setting HELIUS_API_KEY. */
export function mockPositions(address: string): Position[] {
  const r = rng(hash(address)), now = Date.now(), out: Position[] = [];
  const winProb = 0.35 + r() * 0.3, patient = 0.5 + r() * 2.5; // FOMO wallets differ via these
  for (let i = 0; i < 45; i++) {
    const entryTs = now - r() * 14 * 864e5, win = r() < winProb;
    const holdMin = win ? (5 + r() * 40) * patient : 30 + r() * 240;
    const cost = 0.3 + r() * 2, ret = win ? 1.2 + r() * 1.2 : 0.3 + r() * 0.6;
    const adds = r() < 0.25 ? 1 : 0;
    out.push({ token: TOKENS[Math.floor(r() * TOKENS.length)], entryTs, exitTs: entryTs + holdMin * 6e4,
      costSol: cost, proceedsSol: cost * ret, adds, addsLower: adds && r() < 0.8 ? 1 : 0, chasedPump: r() < 0.3 });
    if (!win && r() < 0.3) { // revenge re-entry: bigger size, minutes after a loss
      const t = entryTs + holdMin * 6e4 + 3 * 6e4;
      out.push({ token: TOKENS[Math.floor(r() * TOKENS.length)], entryTs: t, exitTs: t + 20 * 6e4,
        costSol: cost * 2, proceedsSol: cost * 2 * 0.6, adds: 0, addsLower: 0, chasedPump: true });
    }
  }
  for (let i = 0; i < 2; i++) out.push({ token: TOKENS[i], entryTs: now - 2 * 864e5, exitTs: null, costSol: 1, proceedsSol: 0, adds: 0, addsLower: 0 });
  return out.sort((a, b) => a.entryTs - b.entryTs);
}
