"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import type { BurnPlan } from "@/lib/burn";

type Data = BurnPlan & { currentMcap: number | null };
const n = (x: number) => x.toLocaleString("en-US");
const usd = (x: number) => (x >= 1_000_000 ? `$${(x / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M` : `$${n(x / 1000)}k`);

/** Holders-only dev-supply burn roadmap. Renders nothing unless the server confirms the user holds $REFLECT. */
export function BurnSchedule({ wallets }: { wallets: string[] }) {
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => {
    const addrs = wallets.filter((w) => !w.startsWith("@"));
    if (!addrs.length) { setD(null); return; }
    let stop = false;
    fetch("/api/burn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallets: addrs }) })
      .then((r) => (r.ok ? r.json() : null)).then((j) => { if (!stop) setD(j); }).catch(() => {});
    return () => { stop = true; };
  }, [wallets]);
  if (!d) return null;

  const cap = d.currentMcap ?? 0;
  const burned = d.milestones.filter((m) => cap >= m.mcap).reduce((s, m) => s + m.burn, 0);
  const next = d.milestones.find((m) => cap < m.mcap);
  return (
    <Card title="Holder Roadmap: Dev Supply Burn" subtitle="Visible to $REFLECT holders only">
      <p className="text-sm leading-relaxed text-slate-300">
        The goal is to burn the entire dev supply ({n(d.devSupply)} tokens) as Reflect grows. {n(d.milestones[0].burn)} tokens burn at {usd(d.milestones[0].mcap)} market cap,
        then 1,000,000 more for every additional $50k, until none is left. The last burn lands at {usd(d.finalMcap)}.
      </p>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[["Dev supply", n(d.devSupply)], ["Burned so far", d.currentMcap ? n(burned) : "n/a"], ["Remaining", d.currentMcap ? n(d.devSupply - burned) : "n/a"]].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-line bg-ink/60 p-2"><div className="text-[10px] uppercase tracking-wider text-slate-500">{k}</div><div className="font-mono text-sm text-white">{v}</div></div>
        ))}
      </div>
      {d.currentMcap && <p className="mt-2 text-xs text-slate-400">Market cap now {usd(d.currentMcap)}{next ? `. Next burn: ${n(next.burn)} tokens at ${usd(next.mcap)}.` : ". Every milestone has been reached."}</p>}
      <div className="mt-4 max-h-72 overflow-auto rounded-lg border border-line">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-ink text-slate-500"><tr>{["#", "Market cap", "Burn", "Total burned", "Dev supply left"].map((h) => <th key={h} className="px-2 py-1.5 text-right font-medium first:text-left">{h}</th>)}</tr></thead>
          <tbody className="font-mono text-slate-200">
            {d.milestones.map((m) => (
              <tr key={m.n} className={`border-t border-line ${cap >= m.mcap ? "text-neon" : ""}`}>
                <td className="px-2 py-1.5">{m.n}</td><td className="px-2 py-1.5 text-right">{usd(m.mcap)}</td><td className="px-2 py-1.5 text-right">{n(m.burn)}</td>
                <td className="px-2 py-1.5 text-right">{n(m.cumulative)}</td><td className="px-2 py-1.5 text-right">{n(m.remaining)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">A plan, not a guarantee. Not financial advice.</p>
    </Card>
  );
}
