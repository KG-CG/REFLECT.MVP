// Client-safe (no server imports) so the UI can use the same numbers as the server.
export type Tier = "free" | "premium";
export const LIMITS = { free: { personal: 2, fomo: 2 }, premium: { personal: 6, fomo: 6 } } as const;
