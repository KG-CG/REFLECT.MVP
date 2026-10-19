/** One round-trip (or still-open) position in a single token. All amounts in SOL. */
export interface Position {
  token: string; entryTs: number; exitTs: number | null;
  costSol: number; proceedsSol: number;
  adds: number; addsLower: number; // extra buys / extra buys at a lower price (averaging down)
  chasedPump?: boolean;            // TODO: set from price history (entered after a big run-up)
}
export interface Metrics {
  trades: number; winRate: number; avgHoldWinMin: number; avgHoldLossMin: number;
  realizedPnlSol: number; openPositions: number; openCostSol: number;
  topTokens: { token: string; share: number }[]; concentrationPct: number; tradesPerDay: number;
}
export interface Pattern { id: string; label: string; severity: "low" | "med" | "high"; detail: string }
export interface Report { label: string; source: "helius" | "mock"; metrics: Metrics; patterns: Pattern[] }
export interface AnalysisResult { me: Report; fomo: Report[]; comparisons: string[]; journal: string; tips: string[] }
