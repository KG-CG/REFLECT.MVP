/** One round-trip (or still-open) position in a single token. All amounts in SOL. */
export interface Position {
  token: string; entryTs: number; exitTs: number | null;
  costSol: number; proceedsSol: number;
  adds: number; addsLower: number; // extra buys / extra buys at a lower price (averaging down)
  mint?: string; symbol?: string; openQty?: number; // set for open positions so we can price them
  basisSol?: number;               // open: cost basis of what is still held (average-cost method)
  realizedSol?: number;            // open: PnL already realized from partial sells
  avgCostSol?: number;             // average entry price, SOL per token
  markSol?: number;                // current value of an open position in SOL (unrealized)
}
/** One row of the "Recent trades" table: a real token with its real result. */
export interface RecentTrade { token: string; mint?: string; ts: number; open: boolean; costSol: number; avgCostSol: number | null; pnlSol: number | null; pnlPct: number | null; holdMin: number | null }
export interface Metrics {
  trades: number; winRate: number; avgHoldWinMin: number; avgHoldLossMin: number;
  realizedPnlSol: number; unrealizedPnlSol: number | null; openPositions: number; openCostSol: number;
  recent: RecentTrade[];
  topTokens: { token: string; share: number }[]; concentrationPct: number; tradesPerDay: number;
  closedTrades: number;
  avgWinPct: number; avgLossPct: number;   // average return of winners / size of losers, as % of cost (both positive)
  payoffRatio: number;                     // avg win SOL / avg loss SOL
  profitFactor: number;                    // gross profit / gross loss (Infinity-safe: 0 when no losses)
  expectancySol: number;                   // average realized SOL per closed trade
  largestLossSol: number; largestLossShare: number; // biggest single loss and its share of all losses (0-1)
  sizeCv: number;                          // position-size variability (std dev / mean)
}
export interface Pattern { id: string; label: string; severity: "low" | "med" | "high"; detail: string; costSol?: number /* realized PnL of the trades affected by this habit */; count?: number }
export interface Report { label: string; source: "helius"; metrics: Metrics; patterns: Pattern[] }
export interface Tip { id: string; title: string; evidence: string; action: string; priority: 1 | 2 | 3 }
export interface AnalysisResult { me: Report; fomo: Report[]; comparisons: string[]; journal: string; solUsd: number | null; journalSource: "template" | "llm"; tips: Tip[]; strengths: string[]; rules: string[]; generatedAt: string }
