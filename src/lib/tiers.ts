/**
 * ACCESS CONTROL (simple version): fixed limits per tier.
 * TODO($REFLECT premium): replace getTier() with an on-chain check, e.g. read the connected wallet's
 * $REFLECT token balance (getTokenAccountsByOwner) and return "premium" above a threshold.
 * Premium could unlock more wallets, longer history, and the LLM-written journal.
 */
export type Tier = "free" | "premium";
export const LIMITS = { free: { personal: 2, fomo: 2 }, premium: { personal: 10, fomo: 10 } } as const;
export function getTier(): Tier { return "free"; }
