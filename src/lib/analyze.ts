import type { Metrics, Pattern, Position, Report, AnalysisResult } from "./types";
const MIN = 6e4, avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

export function computeMetrics(ps: Position[]): Metrics {
  const closed = ps.filter((p) => p.exitTs), open = ps.filter((p) => !p.exitTs);
  const wins = closed.filter((p) => p.proceedsSol > p.costSol), losses = closed.filter((p) => p.proceedsSol <= p.costSol);
  const hold = (p: Position) => (p.exitTs! - p.entryTs) / MIN;
  const byToken = new Map<string, number>(); ps.forEach((p) => byToken.set(p.token, (byToken.get(p.token) || 0) + p.costSol));
  const total = avg([...byToken.values()]) * byToken.size || 1;
  const topTokens = [...byToken].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([token, v]) => ({ token, share: v / total }));
  const days = Math.max(1, (Date.now() - Math.min(...ps.map((p) => p.entryTs))) / 864e5);
  return { trades: ps.length, winRate: closed.length ? wins.length / closed.length : 0,
    avgHoldWinMin: avg(wins.map(hold)), avgHoldLossMin: avg(losses.map(hold)),
    realizedPnlSol: closed.reduce((s, p) => s + p.proceedsSol - p.costSol, 0),
    openPositions: open.length, openCostSol: open.reduce((s, p) => s + p.costSol, 0),
    topTokens, concentrationPct: (topTokens[0]?.share || 0) * 100, tradesPerDay: ps.length / days };
}

/** Rule-based pattern detection. Thresholds are easy to tune here. */
export function detectPatterns(ps: Position[], m: Metrics): Pattern[] {
  const out: Pattern[] = [], n = Math.max(1, ps.length);
  // Revenge trading: new entry within 10 min of a losing exit, with larger size
  let revenge = 0;
  ps.forEach((p, i) => { const prev = ps.slice(0, i).filter((q) => q.exitTs && q.proceedsSol < q.costSol).pop();
    if (prev && p.entryTs - prev.exitTs! < 10 * MIN && p.entryTs >= prev.exitTs! && p.costSol > prev.costSol * 1.3) revenge++; });
  if (revenge >= 2) out.push({ id: "revenge", label: "Revenge trading", severity: revenge > 5 ? "high" : "med", detail: `${revenge} times you re-entered within 10 minutes of a loss with a bigger size.` });
  const chased = ps.filter((p) => p.chasedPump).length / n;
  if (chased > 0.25) out.push({ id: "fomo", label: "FOMO entries", severity: chased > 0.4 ? "high" : "med", detail: `${Math.round(chased * 100)}% of entries came after a large run-up.` });
  if (m.avgHoldWinMin && m.avgHoldLossMin && m.avgHoldWinMin < m.avgHoldLossMin * 0.5)
    out.push({ id: "early", label: "Cutting winners early", severity: "med", detail: `Winners are held ${Math.round(m.avgHoldWinMin)} min on average vs ${Math.round(m.avgHoldLossMin)} min for losers.` });
  const down = ps.filter((p) => p.addsLower > 0).length / n;
  if (down > 0.15) out.push({ id: "avgdown", label: "Averaging down", severity: down > 0.3 ? "high" : "low", detail: `${Math.round(down * 100)}% of positions had extra buys at a lower price.` });
  if (m.tradesPerDay > 5) out.push({ id: "overtrade", label: "Overtrading", severity: m.tradesPerDay > 10 ? "high" : "med", detail: `${m.tradesPerDay.toFixed(1)} trades per day on average.` });
  // Narrative chasing is a rough proxy: many distinct tokens, very short holds. TODO: use token metadata/themes.
  if (m.topTokens.length >= 5 && m.avgHoldWinMin < 20 && m.avgHoldLossMin < 20)
    out.push({ id: "narrative", label: "Narrative chasing (heuristic)", severity: "low", detail: "Many different tokens with very short holds suggests rotating into whatever is trending." });
  return out;
}

export function compare(me: Metrics, o: Metrics, name: string): string[] {
  const out: string[] = [];
  if (me.avgHoldWinMin && o.avgHoldWinMin) { const d = ((me.avgHoldWinMin - o.avgHoldWinMin) / o.avgHoldWinMin) * 100;
    if (Math.abs(d) > 15) out.push(`You hold winners ${Math.abs(Math.round(d))}% ${d < 0 ? "shorter" : "longer"} than ${name}.`); }
  const wr = (me.winRate - o.winRate) * 100;
  if (Math.abs(wr) > 5) out.push(`Your win rate is ${Math.abs(Math.round(wr))} points ${wr < 0 ? "lower" : "higher"} than ${name}.`);
  const tpd = me.tradesPerDay - o.tradesPerDay;
  if (Math.abs(tpd) > 1) out.push(`You make ${Math.abs(tpd).toFixed(1)} ${tpd > 0 ? "more" : "fewer"} trades per day than ${name}.`);
  return out.length ? out : [`Your patterns are close to ${name}'s.`];
}

const TIPS: Record<string, string> = {
  revenge: "After a loss, set a 30-minute cooldown before the next entry, and never size up to win it back.",
  fomo: "Write the entry reason and an exit level before buying. If the token is already up a lot, wait for a pullback or skip it.",
  early: "Take partial profits at a target and leave a small runner, rather than selling the whole position at the first green.",
  avgdown: "Add only if your original thesis is intact, with a pre-set max size. Otherwise a falling price is a reason to exit.",
  overtrade: "Cap yourself at a fixed number of new entries per day. Fewer, planned trades usually beat many reactive ones.",
  narrative: "Pick one or two themes you understand and size by conviction, not by what is trending on your feed.",
};

export function buildReport(ps: Position[], label: string, source: "helius" | "mock"): Report {
  const metrics = computeMetrics(ps); return { label, source, metrics, patterns: detectPatterns(ps, metrics) };
}

/**
 * Journal text is template-based. TODO(LLM): send `me` (metrics + patterns) to an LLM here and ask for a
 * plain-language, non-hype journal entry. Keep it a premium feature if you want to gate it.
 */
export function buildResult(me: Report, fomo: Report[]): AnalysisResult {
  const m = me.metrics, pnl = m.realizedPnlSol;
  const journal = `Over ${m.trades} positions, you won ${Math.round(m.winRate * 100)}% of closed trades with realized PnL of ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} SOL. ` +
    `Winners were held ~${Math.round(m.avgHoldWinMin)} min and losers ~${Math.round(m.avgHoldLossMin)} min. ` +
    `${m.topTokens[0]?.token ?? "Your top token"} makes up ${Math.round(m.concentrationPct)}% of capital deployed. ` +
    (me.patterns.length ? `Main behaviors to watch: ${me.patterns.map((p) => p.label.toLowerCase()).join(", ")}.` : "No strong negative patterns detected in this window.");
  const tips = me.patterns.map((p) => TIPS[p.id]).filter(Boolean);
  return { me, fomo, journal, tips: tips.length ? tips : ["Keep logging trades and review weekly. Your behavior looks consistent."],
    comparisons: fomo.flatMap((f) => compare(m, f.metrics, f.label)) };
}
