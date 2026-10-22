import type { AnalysisResult, Metrics, Report } from "@/lib/types";
import { Card, Stat, SourceBadge, fmtMin, type Tone } from "./ui";
import { makeMoney, plural } from "@/lib/analyze";

const sevStyle = { low: "bg-slate-500/15 text-slate-300", med: "bg-accent/15 text-accent", high: "bg-loss/15 text-loss" };
const sevLabel = { low: "Low", med: "Medium", high: "High" };
const prio = { 1: ["Fix first", "bg-loss/15 text-loss"], 2: ["Improve", "bg-accent/15 text-accent"], 3: ["Habit", "bg-slate-500/15 text-slate-300"] } as const;
const payoffStat = (m: Metrics): { value: string; tone: Tone; hint: string } => {
  if (!m.closedTrades) return { value: "n/a", tone: "neutral", hint: `+${Math.round(m.avgWinPct * 100)}% / −${Math.round(m.avgLossPct * 100)}%` };
  if (!m.avgWinPct) return { value: "No wins", tone: "bad", hint: `avg loss −${Math.round(m.avgLossPct * 100)}%` };
  if (!m.avgLossPct) return { value: "No losses", tone: "good", hint: `avg win +${Math.round(m.avgWinPct * 100)}%` };
  return { value: `${m.payoffRatio.toFixed(2)}×`, tone: m.payoffRatio >= 1 ? "good" : "bad", hint: `+${Math.round(m.avgWinPct * 100)}% / −${Math.round(m.avgLossPct * 100)}%` };
};

export function Results({ data }: { data: AnalysisResult }) {
  const m = data.me.metrics, signed = makeMoney(data.solUsd), pnlTone = (n: number): Tone => (n > 0 ? "good" : n < 0 ? "bad" : "neutral");
  const payoff = payoffStat(m);
  return (
    <div className="space-y-4">
      <Card title="Journal" subtitle={`Updated ${new Date(data.generatedAt).toLocaleString()} · ${data.journalSource === "llm" ? "AI-written" : "auto-generated"}`} action={<SourceBadge />} id="journal">
        <p className="max-w-prose leading-relaxed text-slate-200">{data.journal}</p>
        {data.strengths.length > 0 && (
          <div className="mt-4 rounded-xl border border-win/25 bg-win/5 p-3.5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-win">What’s working</div>
            <ul className="mt-1.5 space-y-1 text-sm text-slate-200">{data.strengths.map((s) => <li key={s}>✓ {s}</li>)}</ul>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="Realized PnL" value={signed(m.realizedPnlSol)} tone={pnlTone(m.realizedPnlSol)} hint={plural(m.closedTrades, "closed trade")} />
        <Stat label="Unrealized PnL" value={m.unrealizedPnlSol === null ? "n/a" : signed(m.unrealizedPnlSol)} tone={m.unrealizedPnlSol === null ? "neutral" : pnlTone(m.unrealizedPnlSol)} hint={`${m.openPositions} open (${signed(m.openCostSol, false)})`} />
        <Stat label="Win rate" value={`${Math.round(m.winRate * 100)}%`} hint={plural(m.trades, "position")} />
        <Stat label="Expectancy" value={signed(m.expectancySol)} tone={pnlTone(m.expectancySol)} hint="avg per closed trade" />
        <Stat label="Avg win / loss" value={payoff.value} tone={payoff.tone} hint={payoff.hint} />
        <Stat label="Hold: winners" value={fmtMin(m.avgHoldWinMin)} hint={`losers ${fmtMin(m.avgHoldLossMin)}`} />
        <Stat label="Top token" value={`${Math.round(m.concentrationPct)}%`} tone={m.concentrationPct > 40 && m.trades >= 5 ? "bad" : "neutral"} hint={m.topTokens[0]?.token ?? ""} />
        <Stat label="Positions / day" value={m.tradesPerDay.toFixed(1)} tone={m.tradesPerDay > 5 ? "bad" : "neutral"} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3"><RecentTrades data={data} /></div>
        <div className="min-w-0 lg:col-span-2"><Card title="Behavior patterns" subtitle="Detected from your actual trades" id="patterns">
          {data.me.patterns.length === 0 ? <p className="text-sm text-slate-400">No strong negative patterns in this window.</p> : (
            <ul className="space-y-2">{data.me.patterns.map((p) => (
              <li key={p.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                <div className="flex items-center justify-between gap-2"><span className="font-medium text-white">{p.label}</span><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${sevStyle[p.severity]}`}>{sevLabel[p.severity]}</span></div>
                <p className="mt-1 text-sm text-slate-400">{p.detail}</p>
                {p.costSol !== undefined && p.costSol < 0 && <p className="mt-1 text-xs font-medium text-loss">Cost you {signed(-p.costSol, false)}</p>}
              </li>))}
            </ul>)}
        </Card></div>
      </div>

      {data.fomo.length > 0 && <Comparison data={data} />}

      {data.rules.length > 0 && (
        <Card title="Your personal rules" subtitle="Built from your own numbers. Copy these into your notes." id="rules">
          <ul className="space-y-2">{data.rules.map((x) => <li key={x} className="flex gap-3 rounded-xl border border-accent/30 bg-accent/5 px-3.5 py-2.5 text-sm text-slate-100"><span className="text-accent">▸</span>{x}</li>)}</ul>
        </Card>
      )}

      <Card title="Tips to improve" subtitle="Based on your own numbers. Not financial advice." id="tips">
        <ol className="space-y-3">{data.tips.map((t, i) => (
          <li key={t.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-center gap-2"><span className="text-xs tabular-nums text-slate-500">{String(i + 1).padStart(2, "0")}</span><h3 className="font-medium text-white">{t.title}</h3><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${prio[t.priority][1]}`}>{prio[t.priority][0]}</span></div>
            <p className="mt-2 text-sm text-slate-400"><span className="text-slate-300">Your data: </span>{t.evidence}</p>
            <p className="mt-1.5 text-sm text-slate-200"><span className="font-medium text-neon">Do this: </span>{t.action}</p>
          </li>))}
        </ol>
      </Card>
    </div>
  );
}

type Row = [label: string, get: (r: Report) => number, fmt: (n: number) => string, higherIsBetter: boolean | null];
const ROWS: Row[] = [
  ["Win rate", (r) => r.metrics.winRate, (n) => `${Math.round(n * 100)}%`, true],
  ["Avg win / loss", (r) => r.metrics.payoffRatio, (n) => (n ? `${n.toFixed(2)}×` : "n/a"), true],
  ["Hold, winners", (r) => r.metrics.avgHoldWinMin, fmtMin, true],
  ["Hold, losers", (r) => r.metrics.avgHoldLossMin, fmtMin, false],
  ["Positions / day", (r) => r.metrics.tradesPerDay, (n) => n.toFixed(1), null],
  ["Top token share", (r) => r.metrics.concentrationPct, (n) => `${Math.round(n)}%`, false],
];

function Comparison({ data }: { data: AnalysisResult }) {
  return (
    <Card title="You vs. FOMO wallets" subtitle="Green = better than you on that metric, red = worse" id="compare">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wider text-slate-400"><th className="pb-2 font-medium">Metric</th><th className="pb-2 font-medium text-white">You</th>
            {data.fomo.map((f) => <th key={f.label} className="pb-2 font-medium"><span className="mr-1.5">{f.label}</span><SourceBadge /></th>)}</tr></thead>
          <tbody className="[&_td]:border-t [&_td]:border-line [&_td]:py-2.5 tabular-nums">
            {ROWS.map(([label, get, fmt, better]) => (
              <tr key={label}><td className="text-slate-400">{label}</td><td className="font-medium text-white">{fmt(get(data.me))}</td>
                {data.fomo.map((o) => {
                  const mine = get(data.me), theirs = get(o), diff = better === null || Math.abs(theirs - mine) < 1e-9 ? 0 : (theirs > mine ? 1 : -1) * (better ? 1 : -1);
                  return <td key={o.label} className={diff > 0 ? "text-win" : diff < 0 ? "text-loss" : "text-slate-300"}>{fmt(theirs)}</td>;
                })}</tr>))}
          </tbody>
        </table>
      </div>
      <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-slate-400">Key differences</h3>
      <ul className="space-y-1.5 text-sm text-slate-200">{data.comparisons.map((c, i) => <li key={i} className="flex gap-2"><span className="text-neon">→</span>{c}</li>)}</ul>
    </Card>
  );
}

/** Most recent positions with the real token, result and size. Open positions show unrealized PnL when priced. */
function RecentTrades({ data }: { data: AnalysisResult }) {
  const signed = makeMoney(data.solUsd), rows = data.me.metrics.recent;
  const ago = (ts: number) => { const h = (Date.now() - ts) / 36e5, days = h / 24; return h < 1 ? `${Math.max(1, Math.round(h * 60))}m ago` : h < 48 ? `${Math.round(h)}h ago` : days > 365 ? `${(days / 365).toFixed(1)}y ago` : `${Math.round(days)}d ago`; };
  return (
    <Card title="Recent trades" subtitle="Latest positions with their real result" id="recent">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="text-[11px] uppercase tracking-wider text-slate-500"><th className="pb-2 font-medium">Token</th><th className="hidden pb-2 text-right font-medium sm:table-cell">Size</th><th className="pb-2 text-right font-medium">PnL</th><th className="pb-2 text-right font-medium">Return</th><th className="pb-2 text-right font-medium">When</th></tr></thead>
          <tbody className="divide-y divide-white/5">{rows.map((t, i) => {
            const tone = t.pnlSol === null ? "text-slate-400" : t.pnlSol >= 0 ? "text-win" : "text-loss";
            return (
              <tr key={i}>
                <td className="py-2.5 pr-2"><span className="font-medium text-white break-all">{t.token}</span>{t.open && <span className="ml-2 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-neon">OPEN</span>}</td>
                <td className="hidden py-2.5 text-right tabular-nums text-slate-300 sm:table-cell">{signed(t.costSol, false)}</td>
                <td className={`py-2.5 text-right font-medium tabular-nums ${tone}`}>{t.pnlSol === null ? "n/a" : signed(t.pnlSol)}</td>
                <td className={`py-2.5 text-right tabular-nums ${tone}`}>{t.pnlPct === null ? "–" : `${t.pnlPct >= 0 ? "+" : ""}${Math.round(t.pnlPct * 100)}%`}</td>
                <td className="py-2.5 text-right text-xs text-slate-500">{ago(t.ts)}</td>
              </tr>);
          })}</tbody>
        </table>
      </div>
    </Card>
  );
}
