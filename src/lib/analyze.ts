import type { Metrics, Pattern, Position, Report, AnalysisResult, Tip } from "./types";
const MIN = 6e4;
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const pct = (n: number) => `${Math.round(n * 100)}%`;
export const SAMPLE_TARGET = 30;
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
/** Formats an amount held in SOL. Shown in USD when a SOL price is known (FOMO users think in dollars). */
export type Money = (solAmount: number, signed?: boolean) => string;
export const makeMoney = (solUsd: number | null): Money => (n, signed = true) => {
  const sign = signed ? (n >= 0 ? "+" : "−") : n < 0 ? "−" : "";
  const abs = Math.abs(solUsd ? n * solUsd : n);
  return solUsd ? `${sign}$${abs >= 100 ? Math.round(abs).toLocaleString("en-US") : abs.toFixed(2)}` : `${sign}${abs.toFixed(2)} SOL`;
};
const mins = (n: number) => (n >= 120 ? `${(n / 60).toFixed(1)} h` : `${Math.round(n)} min`);

export function computeMetrics(ps: Position[]): Metrics {
  const closed = ps.filter((p) => p.exitTs), open = ps.filter((p) => !p.exitTs);
  const pnl = (p: Position) => p.proceedsSol - p.costSol;
  const wins = closed.filter((p) => pnl(p) > 0), losses = closed.filter((p) => pnl(p) <= 0);
  const hold = (p: Position) => (p.exitTs! - p.entryTs) / MIN;
  const byToken = new Map<string, number>();
  ps.forEach((p) => { const token = p.symbol || p.token; byToken.set(token, (byToken.get(token) || 0) + p.costSol); });
  const total = sum([...byToken.values()]) || 1;
  const topTokens = [...byToken].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([token, v]) => ({ token, share: v / total }));
  const days = ps.length ? Math.max(1, (Date.now() - Math.min(...ps.map((p) => p.entryTs))) / 864e5) : 1;
  const priced = open.filter((p) => p.markSol !== undefined); // null = no price data available
  const grossWin = sum(wins.map(pnl)), grossLoss = Math.abs(sum(losses.map(pnl)));
    const sizes = ps.map((p) => p.costSol), meanSize = avg(sizes);
  const sd = Math.sqrt(avg(sizes.map((s) => (s - meanSize) ** 2)));
  const lastTs = (p: Position) => p.exitTs ?? p.entryTs;
  const recent = [...ps].sort((x, y) => lastTs(y) - lastTs(x)).slice(0, 12).map((p) => {
    const mark = !p.exitTs && p.markSol !== undefined ? p.markSol : null;
    const basis = p.basisSol ?? p.costSol;
    const pnlSol = p.exitTs ? pnl(p) : mark !== null ? mark - basis + (p.realizedSol ?? p.proceedsSol) : null;
    return { token: p.symbol || p.token, mint: p.mint, ts: lastTs(p), open: !p.exitTs, costSol: p.exitTs ? p.costSol : basis, avgCostSol: p.avgCostSol ?? null, pnlSol, pnlPct: pnlSol !== null && p.costSol ? pnlSol / (p.exitTs ? p.costSol : p.costSol) : null, holdMin: p.exitTs ? hold(p) : null };
  });
  const worst = Math.max(0, ...losses.map((p) => -pnl(p)));
  return {
    trades: ps.length, closedTrades: closed.length, winRate: closed.length ? wins.length / closed.length : 0,
    avgHoldWinMin: avg(wins.map(hold)), avgHoldLossMin: avg(losses.map(hold)),
    realizedPnlSol: sum(closed.map(pnl)),
    // open value + anything already sold from it - what it cost
    unrealizedPnlSol: priced.length ? sum(priced.map((p) => p.markSol! - (p.basisSol ?? p.costSol))) : null,
    openPositions: open.length, openCostSol: sum(open.map((p) => p.basisSol ?? p.costSol)),
    recent, topTokens, concentrationPct: (topTokens[0]?.share || 0) * 100, tradesPerDay: ps.length / days,
    avgWinPct: avg(wins.map((p) => pnl(p) / p.costSol)), avgLossPct: Math.abs(avg(losses.map((p) => pnl(p) / p.costSol))),
    // Per-trade return ratio, so it matches the "+x% / -y%" shown beside it and isn't skewed by a few big positions.
    payoffRatio: avg(losses.map((p) => pnl(p) / p.costSol)) ? avg(wins.map((p) => pnl(p) / p.costSol)) / Math.abs(avg(losses.map((p) => pnl(p) / p.costSol))) : 0, profitFactor: grossLoss ? grossWin / grossLoss : 0,
    expectancySol: closed.length ? sum(closed.map(pnl)) / closed.length : 0,
    largestLossSol: worst, largestLossShare: grossLoss ? worst / grossLoss : 0,
    sizeCv: meanSize ? sd / meanSize : 0,
  };
}

/** Rule-based pattern detection. Thresholds are easy to tune here. */
export function detectPatterns(ps: Position[], m: Metrics): Pattern[] {
  const out: Pattern[] = [], n = Math.max(1, ps.length);
  // Revenge trading: new entry within 10 min of a losing exit, with larger size
  let revenge = 0, revengeCost = 0;
  ps.forEach((p, i) => {
    const prev = ps.slice(0, i).filter((q) => q.exitTs && q.proceedsSol < q.costSol).pop();
    if (prev && p.entryTs - prev.exitTs! < 10 * MIN && p.entryTs >= prev.exitTs! && p.costSol > prev.costSol * 1.3) { revenge++; if (p.exitTs) revengeCost += p.proceedsSol - p.costSol; }
  });
  if (revenge >= 2) out.push({ id: "revenge", label: "Revenge trading", severity: revenge > 5 ? "high" : "med", count: revenge, costSol: revengeCost, detail: `${revenge} times you re-entered within 10 minutes of a loss with a bigger size.` });
  if (m.avgHoldWinMin && m.avgHoldLossMin && m.avgHoldWinMin < m.avgHoldLossMin * 0.5)
    out.push({ id: "early", label: "Cutting winners early", severity: "med", detail: `Winners are held ${mins(m.avgHoldWinMin)} on average vs ${mins(m.avgHoldLossMin)} for losers.` });
  const downPs = ps.filter((p) => p.addsLower > 0), down = downPs.length / n;
  const downCost = downPs.filter((p) => p.exitTs).reduce((s, p) => s + p.proceedsSol - p.costSol, 0);
  if (down > 0.15) out.push({ id: "avgdown", label: "Averaging down", severity: down > 0.3 ? "high" : "low", count: downPs.length, costSol: downCost, detail: `${pct(down)} of positions had extra buys at a lower price.` });
  if (m.tradesPerDay > 5) out.push({ id: "overtrade", label: "Overtrading", severity: m.tradesPerDay > 10 ? "high" : "med", detail: `${m.tradesPerDay.toFixed(1)} new positions per day on average.` });
  // Bag-holding: a few losers far bigger than your typical loss
  const closedLoss = ps.filter((p) => p.exitTs && p.proceedsSol < p.costSol);
  const typical = avg(closedLoss.map((p) => p.costSol - p.proceedsSol));
  const big = closedLoss.filter((p) => p.costSol - p.proceedsSol > typical * 2.5);
  if (closedLoss.length >= 8 && big.length >= 2) out.push({ id: "bags", label: "Letting losers run", severity: big.length > 4 ? "high" : "med", count: big.length, costSol: -big.reduce((s, p) => s + p.costSol - p.proceedsSol, 0),
    detail: `${big.length} losses were 2.5× bigger than your typical loss; together they are ${pct(big.reduce((s, p) => s + p.costSol - p.proceedsSol, 0) / Math.max(1e-9, closedLoss.reduce((s, p) => s + p.costSol - p.proceedsSol, 0)))} of all your losses.` });
  // Narrative chasing is a rough proxy: many distinct tokens, very short holds. TODO: use token metadata/themes.
  if (m.topTokens.length >= 5 && m.avgHoldWinMin < 20 && m.avgHoldLossMin < 20)
    out.push({ id: "narrative", label: "Narrative chasing (heuristic)", severity: "low", detail: "Many different tokens with very short holds suggests rotating into whatever is trending." });
  return out;
}

export function compare(me: Metrics, o: Metrics, name: string): string[] {
  const out: string[] = [];
  if (me.avgHoldWinMin && o.avgHoldWinMin) {
    const d = ((me.avgHoldWinMin - o.avgHoldWinMin) / o.avgHoldWinMin) * 100;
    if (Math.abs(d) > 15) out.push(`You hold winners ${Math.abs(Math.round(d))}% ${d < 0 ? "shorter" : "longer"} than ${name}.`);
  }
  const wr = (me.winRate - o.winRate) * 100;
  if (Math.abs(wr) > 5) out.push(`Your win rate is ${Math.abs(Math.round(wr))} points ${wr < 0 ? "lower" : "higher"} than ${name}.`);
  if (me.payoffRatio && o.payoffRatio && Math.abs(me.payoffRatio - o.payoffRatio) > 0.3)
    out.push(`Your average win return is ${me.payoffRatio.toFixed(1)}× your average loss return; ${name}'s is ${o.payoffRatio.toFixed(1)}×.`);
  const tpd = me.tradesPerDay - o.tradesPerDay;
  if (Math.abs(tpd) > 1) out.push(`You open ${Math.abs(tpd).toFixed(1)} ${tpd > 0 ? "more" : "fewer"} positions per day than ${name}.`);
  return out.length ? out : [`Your patterns are close to ${name}'s.`];
}

export function buildReport(ps: Position[], label: string, source: "helius"): Report {
  const metrics = computeMetrics(ps);
  return { label, source, metrics, patterns: detectPatterns(ps, metrics) };
}

/**
 * Data-driven coaching. Each tip cites the user's own numbers (evidence) and gives one concrete,
 * testable action. Add a rule here to add a tip; priority 1 = fix first. Not financial advice.
 */
export function buildTips(me: Report, sol: Money): Tip[] {
  const m = me.metrics, tips: Tip[] = [], has = (id: string) => me.patterns.some((p) => p.id === id);
  const costNote = (id: string) => { const c = me.patterns.find((p) => p.id === id)?.costSol; return c !== undefined && c < 0 ? ` These trades lost ${sol(-c, false)} in total.` : ""; };
  if (m.closedTrades < 10) tips.push({ id: "sample", priority: 3, title: "Build a bigger sample before drawing conclusions",
    evidence: `Only ${plural(m.closedTrades, "closed trade")} in this window.`, action: "Treat these stats as directional. Keep logging for at least 30 closed trades before changing your strategy." });

  if (m.closedTrades >= 10 && m.payoffRatio) {
    const breakeven = 1 / (1 + m.payoffRatio);
    if (m.winRate < breakeven) tips.push({ id: "edge", priority: 1, title: "Your math doesn't work yet: fix the payoff, not just the win rate",
      evidence: `Your average win (+${Math.round(m.avgWinPct * 100)}%) is ${m.payoffRatio.toFixed(2)}× your average loss (−${Math.round(m.avgLossPct * 100)}%), so you need a ${pct(breakeven)} win rate to break even. You're at ${pct(m.winRate)} (${sol(m.expectancySol)} per trade).`,
      action: m.avgLossPct > m.avgWinPct
        ? `Cut losers faster: your average loss is ${pct(m.avgLossPct)} of the position vs ${pct(m.avgWinPct)} for wins. Set a hard exit around −${Math.max(10, Math.round(m.avgWinPct * 50))}% before you enter.`
        : "Raise the bar for entries (fewer, higher-conviction trades) or let winners run further before taking profit." });
  }
  if (m.largestLossShare > 0.35 && m.closedTrades >= 8) tips.push({ id: "tail", priority: 1, title: "One trade did a large share of your damage",
    evidence: `Your worst loss (${sol(m.largestLossSol, false)}) is ${pct(m.largestLossShare)} of all losses.`,
    action: "Set a maximum loss per trade (for example 1–2% of your trading capital) and size positions so a total loss stays under it." });
  if (m.sizeCv > 0.9) tips.push({ id: "sizing", priority: 2, title: "Standardize your position size",
    evidence: `Your position sizes vary a lot (variation ${m.sizeCv.toFixed(1)}× the average size).`,
    action: "Pick 2–3 fixed sizes (small / normal / high-conviction) and write the reason before you go above normal." });
  if (m.avgHoldLossMin > m.avgHoldWinMin * 1.5 && m.avgHoldWinMin > 0) tips.push({ id: "hope", priority: 1, title: "You hold losers longer than winners",
    evidence: `Losers: ${mins(m.avgHoldLossMin)} vs winners: ${mins(m.avgHoldWinMin)}.`,
    action: "Before each entry write the price or reason that proves you wrong. If it hits, exit immediately, and don't wait for a bounce to get back to even. Losers should be your shortest holds, not your longest." });
  if (has("revenge")) tips.push({ id: "revenge", priority: 1, title: "Add a cooldown after losses",
    evidence: me.patterns.find((p) => p.id === "revenge")!.detail + costNote("revenge"),
    action: "After any losing exit: close the app for 30 minutes, then come back at your normal size (never bigger). If you take two losses in a row, you're done for the session. Chasing the loss back is how small losses become big ones." });
  if (has("early")) tips.push({ id: "early", priority: 2, title: "Let your winners work",
    evidence: me.patterns.find((p) => p.id === "early")!.detail,
    action: "Sell a third at +50%, another third at 2×, and leave a runner with a trailing exit. Write the targets down at entry so you're not deciding from emotion." });
  if (has("avgdown")) tips.push({ id: "avgdown", priority: 2, title: "Don't average down by default",
    evidence: me.patterns.find((p) => p.id === "avgdown")!.detail + costNote("avgdown"),
    action: "Decide your total max size BEFORE the first buy and split it in two entries at most. Add only if the reason you bought is still true, not because the price is lower. If the first entry is wrong, the fix is to exit, not to buy more." });
  if (has("bags")) tips.push({ id: "bags", priority: 1, title: "Cap the size of your losses",
    evidence: me.patterns.find((p) => p.id === "bags")!.detail + costNote("bags"),
    action: `Set a hard exit before every entry. Based on your numbers, a loss limit near −${Math.max(15, Math.round(m.avgLossPct * 100 * 1.5))}% per position would cap your worst trades. Use a limit/stop order, or sell half at that level, so you're not deciding in the moment.` });
  if (has("overtrade")) tips.push({ id: "overtrade", priority: 2, title: "Trade less, plan more",
    evidence: me.patterns.find((p) => p.id === "overtrade")!.detail,
    action: "Cap new entries per day (try 3–5). Fewer planned trades usually beat many reactive ones, and you pay less in fees and slippage." });
  if (m.concentrationPct > 40) tips.push({ id: "conc", priority: 2, title: "Reduce concentration risk",
    evidence: `${m.topTokens[0]?.token} is ${Math.round(m.concentrationPct)}% of the capital you deployed.`,
    action: "Keep any single token under about 25% of deployed capital unless you can explain, in one sentence, why it deserves more." });
  if (has("narrative")) tips.push({ id: "narrative", priority: 3, title: "Specialize in a narrative you understand",
    evidence: me.patterns.find((p) => p.id === "narrative")!.detail,
    action: "Pick one or two themes, study how they trend and fade, and size by conviction rather than by feed activity." });
  tips.push({ id: "review", priority: 3, title: "Run a 10-minute weekly review",
    evidence: "Improvement comes from reviewing your actual trades, not from adding more tools.",
    action: "Each week, pick your best and worst trade, write why you entered and exited, and set one rule to follow next week." });
  return tips.sort((a, b) => a.priority - b.priority);
}

/** A short personal rulebook derived from the user's own numbers, meant to be copied into notes. */
function buildRules(me: Report, sol: Money): string[] {
  const m = me.metrics, r: string[] = [], has = (id: string) => me.patterns.some((p) => p.id === id);
  if (m.closedTrades < 5) return ["Log at least 30 closed trades before setting rules."];
  r.push(`Max loss per trade: exit at about −${Math.max(15, Math.round(m.avgLossPct * 100 * 1.5))}% of position size. No exceptions.`);
  if (m.tradesPerDay > 3) r.push(`No more than ${Math.max(2, Math.round(m.tradesPerDay * 0.6))} new positions per day (you average ${m.tradesPerDay.toFixed(1)}).`);
  if (has("revenge")) r.push("After a loss: 30-minute break, then normal size only. Two losses in a row = stop for the day.");
  if (has("avgdown")) r.push("One entry plus one add at most, and only if your original reason still holds.");
  if (m.avgWinPct) r.push(`Take partial profit around +${Math.max(30, Math.round(m.avgWinPct * 100))}% so winners actually pay for the losers.`);
  r.push("Use one standard position size. Only go bigger with a written reason before you buy.");
  return r;
}

function buildStrengths(m: Metrics, sol: Money): string[] {
  const s: string[] = [];
  if (m.closedTrades >= 10 && m.expectancySol > 0) s.push(`Positive expectancy: ${sol(m.expectancySol)} per closed trade.`);
  if (m.profitFactor > 1.2) s.push(`Profit factor of ${m.profitFactor.toFixed(2)}: your wins outweigh your losses.`);
  if (m.payoffRatio >= 1.5) s.push(`Your average winning trade returns ${m.payoffRatio.toFixed(1)}× what your average loser costs.`);
  if (m.avgHoldWinMin > m.avgHoldLossMin * 1.2 && m.avgHoldLossMin > 0) s.push("You let winners run longer than losers.");
  if (m.concentrationPct && m.concentrationPct < 25 && m.topTokens.length >= 3) s.push("Capital is well spread across tokens.");
  return s;
}

/**
 * Journal text is template-based unless an LLM journal is passed in (see llm.ts).
 */
export function buildResult(me: Report, fomo: Report[], llmJournal?: string | null, solUsd: number | null = null): AnalysisResult {
  const m = me.metrics, sol = makeMoney(solUsd);
  const holdSummary = [
    m.closedTrades > 0 && m.winRate > 0 ? `Winners were held about ${mins(m.avgHoldWinMin)}` : "",
    m.closedTrades > 0 && m.winRate < 1 ? `losers were held about ${mins(m.avgHoldLossMin)}` : "",
  ].filter(Boolean).join(" and ");
  const templated = m.trades === 0
    ? "No swaps were found for this wallet in the recent window, so there is nothing to analyze yet."
    : `Over ${plural(m.trades, "position")} you won ${pct(m.winRate)} of ${plural(m.closedTrades, "closed trade")}, with realized PnL of ${sol(m.realizedPnlSol)}` +
      (m.unrealizedPnlSol !== null ? ` (${sol(m.unrealizedPnlSol)} unrealized on open positions)` : "") + ". " +
      (m.closedTrades >= 10 ? `On average a closed trade made ${sol(m.expectancySol)}; winners returned ${pct(m.avgWinPct)} and losers lost ${pct(m.avgLossPct)}. ` : "") +
      (holdSummary ? `${holdSummary}. ` : "") +
      `${m.topTokens[0]?.token ?? "Your top token"} makes up ${Math.round(m.concentrationPct)}% of deployed capital. ` +
      (me.patterns.length ? `Main behaviors to watch: ${me.patterns.map((p) => p.label.toLowerCase()).join(", ")}.` : "No strong negative patterns detected in this window.");
  const journal = llmJournal || templated;
  const earlyRead = m.trades > 0 && m.closedTrades < SAMPLE_TARGET
    ? `Only ${plural(m.closedTrades, "closed trade")} found, and patterns need about ${SAMPLE_TARGET}, so treat this as an early read. `
    : "";
  return {
    me, fomo, journal: earlyRead + journal, journalSource: llmJournal ? "llm" : "template", generatedAt: new Date().toISOString(),
    solUsd, tips: buildTips(me, sol), strengths: buildStrengths(m, sol), rules: buildRules(me, sol), comparisons: fomo.flatMap((f) => compare(m, f.metrics, f.label)),
  };
}
