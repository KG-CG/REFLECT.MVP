"use client";
import { useEffect, useState } from "react";
import type { AnalysisResult, Report } from "@/lib/types";
import { LIMITS, getTier } from "@/lib/tiers";

const lim = LIMITS[getTier()];
const ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/; // base58 Solana address
const sev = { low: "text-slate-300", med: "text-accent", high: "text-loss" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (<section className="rounded-xl border border-line bg-panel p-4 sm:p-5"><h2 className="mb-3 text-base font-semibold text-white">{title}</h2>{children}</section>);
}
function ListEditor({ items, setItems, max, ph, allowHandle }: { items: string[]; setItems: (v: string[]) => void; max: number; ph: string; allowHandle?: boolean }) {
  const [v, setV] = useState(""), [err, setErr] = useState("");
  const add = () => {
    const x = v.trim();
    if (!(ADDR.test(x) || (allowHandle && /^@\w{2,}$/.test(x)))) return setErr(allowHandle ? "Enter a Solana address or an @handle." : "Enter a valid Solana address.");
    if (items.length >= max) return setErr(`Free tier allows ${max}. $REFLECT holders unlock more.`);
    setItems([...items, x]); setV(""); setErr("");
  };
  return (<div>
    <div className="flex gap-2"><input value={v} onChange={(e) => setV(e.target.value)} placeholder={ph} className="min-w-0 flex-1 rounded-lg border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-accent" />
      <button onClick={add} className="rounded-lg bg-accent px-4 text-sm font-medium text-ink">Add</button></div>
    {err && <p className="mt-2 text-xs text-loss">{err}</p>}
    <ul className="mt-3 space-y-1">{items.map((a) => (<li key={a} className="flex items-center justify-between rounded-lg bg-ink px-3 py-2 text-sm">
      <span className="truncate font-mono">{a}</span><button onClick={() => setItems(items.filter((i) => i !== a))} className="ml-3 text-slate-400 hover:text-loss">Remove</button></li>))}</ul>
    <p className="mt-2 text-xs text-slate-500">{items.length}/{max} used</p>
  </div>);
}
const Stat = ({ k, v }: { k: string; v: string }) => (<div className="rounded-lg bg-ink p-3"><div className="text-xs text-slate-400">{k}</div><div className="mt-1 text-lg font-semibold text-white">{v}</div></div>);
function Stats({ r }: { r: Report }) {
  const m = r.metrics;
  return (<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
    <Stat k="Positions" v={String(m.trades)} /><Stat k="Win rate" v={`${Math.round(m.winRate * 100)}%`} />
    <Stat k="Realized PnL" v={`${m.realizedPnlSol >= 0 ? "+" : ""}${m.realizedPnlSol.toFixed(2)} SOL`} /><Stat k="Open positions" v={`${m.openPositions} (${m.openCostSol.toFixed(1)} SOL)`} />
    <Stat k="Avg hold, winners" v={`${Math.round(m.avgHoldWinMin)} min`} /><Stat k="Avg hold, losers" v={`${Math.round(m.avgHoldLossMin)} min`} />
    <Stat k="Top token share" v={`${Math.round(m.concentrationPct)}%`} /><Stat k="Trades / day" v={m.tradesPerDay.toFixed(1)} />
  </div>);
}

export default function Home() {
  const [wallets, setWallets] = useState<string[]>([]), [fomo, setFomo] = useState<string[]>([]);
  const [data, setData] = useState<AnalysisResult | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState("");
  useEffect(() => { try { const s = JSON.parse(localStorage.getItem("reflect") || "{}"); setWallets(s.wallets || []); setFomo(s.fomo || []); } catch {} }, []);
  useEffect(() => { localStorage.setItem("reflect", JSON.stringify({ wallets, fomo })); }, [wallets, fomo]);

  async function run() {
    setLoading(true); setError("");
    try { const r = await fetch("/api/analyze", { method: "POST", body: JSON.stringify({ wallets, fomo }) }); const j = await r.json();
      if (!r.ok) throw new Error(j.error); setData(j); } catch (e: any) { setError(e.message || "Something went wrong."); }
    setLoading(false);
  }
  const demo = () => { setWallets(["DemoWa11et1111111111111111111111111111111111".slice(0, 44)]); setFomo(["@frogtrader"]); };

  return (<main className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:py-10">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-semibold text-white">Reflect</h1><p className="text-sm text-slate-400">A trading journal that reads your actual Solana swaps.</p></div>
      <div className="flex gap-2"><button onClick={demo} className="rounded-lg border border-line px-3 py-2 text-sm">Load demo</button>
        <button onClick={run} disabled={!wallets.length || loading} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-ink disabled:opacity-40">{loading ? "Analyzing…" : data ? "Refresh summary" : "Analyze"}</button></div>
    </header>
    {error && <p className="rounded-lg border border-loss/40 p-3 text-sm text-loss">{error}</p>}
    <div className="grid gap-4 md:grid-cols-2">
      <Section title="My Wallets"><ListEditor items={wallets} setItems={setWallets} max={lim.personal} ph="Solana wallet address" /></Section>
      <Section title="FOMO Wallets I’m Tracking"><ListEditor items={fomo} setItems={setFomo} max={lim.fomo} ph="Address or @handle" allowHandle /></Section>
    </div>
    {!data && <p className="py-10 text-center text-sm text-slate-500">Add a wallet (or load the demo), then select Analyze.{" "}Without a HELIUS_API_KEY the numbers are mock data.</p>}
    {data && (<>
      {data.me.source === "mock" && <p className="text-xs text-accent">Showing mock data. Add HELIUS_API_KEY to analyze real swaps.</p>}
      <Section title="Journal Insights">
        <p className="mb-4 max-w-prose leading-relaxed">{data.journal}</p><Stats r={data.me} />
        <ul className="mt-4 space-y-2">{data.me.patterns.map((p) => (<li key={p.id} className="rounded-lg bg-ink p-3 text-sm"><span className={`font-medium ${sev[p.severity]}`}>{p.label}</span><span className="text-slate-400"> — {p.detail}</span></li>))}</ul>
      </Section>
      {data.fomo.length > 0 && (<Section title="You vs. FOMO wallets">
        <div className="overflow-x-auto"><table className="w-full min-w-[480px] text-sm"><thead className="text-left text-slate-400"><tr><th className="py-2">Metric</th><th>You</th>{data.fomo.map((f) => <th key={f.label}>{f.label}</th>)}</tr></thead>
          <tbody className="[&_td]:border-t [&_td]:border-line [&_td]:py-2">
            {([["Win rate", (r: Report) => `${Math.round(r.metrics.winRate * 100)}%`], ["Hold, winners", (r: Report) => `${Math.round(r.metrics.avgHoldWinMin)} min`], ["Hold, losers", (r: Report) => `${Math.round(r.metrics.avgHoldLossMin)} min`], ["Trades / day", (r: Report) => r.metrics.tradesPerDay.toFixed(1)]] as [string, (r: Report) => string][]).map(([k, f]) => (
              <tr key={k}><td>{k}</td><td className="text-white">{f(data.me)}</td>{data.fomo.map((o) => <td key={o.label}>{f(o)}</td>)}</tr>))}
          </tbody></table></div>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">{data.comparisons.map((c, i) => <li key={i}>{c}</li>)}</ul>
      </Section>)}
      <Section title="Tips"><ul className="list-disc space-y-2 pl-5 text-sm">{data.tips.map((t, i) => <li key={i}>{t}</li>)}</ul></Section>
    </>)}
    <footer className="pt-4 text-xs text-slate-500">Not financial advice. Free tier: {lim.personal} wallets + {lim.fomo} FOMO wallets. $REFLECT holders will unlock more.</footer>
  </main>);
}
