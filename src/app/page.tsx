"use client";
import { useEffect, useState } from "react";
import type { AnalysisResult } from "@/lib/types";
import { LIMITS } from "@/lib/limits";
import { Card } from "@/components/ui";
import { WalletList } from "@/components/WalletList";
import { BurnSchedule } from "@/components/BurnSchedule";
import { Results } from "@/components/Results";


export default function Home() {
  const [wallets, setWallets] = useState<string[]>([]), [fomo, setFomo] = useState<string[]>([]);
  const [data, setData] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState("");

  // Wallet lists live in localStorage (no accounts yet). TODO: move to a DB once you add auth.
  // `loaded` stops the save effect from overwriting stored wallets with the empty initial state.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { try { const s = JSON.parse(localStorage.getItem("reflect") || "{}"); setWallets(s.wallets || []); setFomo(s.fomo || []); } catch {} setLoaded(true); }, []);
  useEffect(() => { if (loaded) localStorage.setItem("reflect", JSON.stringify({ wallets, fomo })); }, [loaded, wallets, fomo]);

  // $REFLECT holders get higher limits; the server checks which of "my wallets" hold the token.
  const [tier, setTier] = useState<"free" | "premium">("free");
  useEffect(() => {
    if (!loaded) return;
    const addrs = wallets.filter((w) => !w.startsWith("@"));
    if (!addrs.length) { setTier("free"); return; }
    let stop = false;
    fetch("/api/tier", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallets: addrs }) })
      .then((r) => r.json()).then((j) => { if (!stop) setTier(j.tier === "premium" ? "premium" : "free"); }).catch(() => {});
    return () => { stop = true; };
  }, [loaded, wallets]);
  const lim = LIMITS[tier];

  // Client-side cooldown: protects free-plan API quota from repeated refresh clicks.
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => { if (cooldown <= 0) return; const t = setTimeout(() => setCooldown(cooldown - 1), 1000); return () => clearTimeout(t); }, [cooldown]);

  async function run(w = wallets, f = fomo) {
    setLoading(true); setError(""); setCooldown(10);
    try {
      const r = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallets: w, fomo: f }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Request failed (${r.status}).`);
      setData(j);
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
    setLoading(false);
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-ink/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            {/* Logo: public/logo.jpg. */}
            <img src="/logo-sm.jpg" alt="Reflect logo" width={40} height={40} decoding="async" fetchPriority="high" className="h-10 w-10 rounded-lg object-cover" />
            <div className="font-semibold uppercase leading-none tracking-[0.2em] text-white">Reflect</div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => run()} disabled={!wallets.length || loading || cooldown > 0} className="btn-neon rounded-lg px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none">
              {loading ? "Analyzing…" : cooldown > 0 ? `Wait ${cooldown}s` : data ? "Refresh summary" : "Analyze"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:py-8">
        {!data && !loading && (
          <section className="py-4 text-center sm:py-8">
            <p className="mx-auto mb-4 w-fit rounded-full border border-neon/30 bg-neon/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-neon">AI trading journal · Solana</p>
            <h1 className="text-gradient mx-auto max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">See how you actually trade.</h1>
            <p className="mx-auto mt-3 max-w-xl text-slate-400">Reflect reads your Solana swaps, spots the habits that cost you money, and gives specific fixes. Compare yourself against FOMO traders you follow.</p>
            <ol className="mx-auto mt-6 flex max-w-2xl flex-col gap-2 text-left text-sm sm:flex-row">
              {["Track your FOMO handle or wallet", "Add FOMO traders to compare", "Analyze and read your journal"].map((s, i) => (
                <li key={s} className="flex flex-1 items-center gap-3 rounded-xl border border-white/10 bg-panel/60 px-3 py-2.5 text-slate-300 backdrop-blur"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent/20 text-xs font-bold text-neon">{i + 1}</span>{s}</li>))}
            </ol>
          </section>
        )}

        {error && <p role="alert" className="rounded-xl border border-loss/40 bg-loss/5 p-3 text-sm text-loss">{error}</p>}

        <div className="grid gap-4 md:grid-cols-2">
          <Card title="My Wallets" subtitle="Track your FOMO account or a Solana address"><WalletList items={wallets} setItems={setWallets} max={lim.personal} slot="mine" /></Card>
          <Card title="FOMO Wallets I’m Tracking" subtitle="Traders to compare yourself against"><WalletList items={fomo} setItems={setFomo} max={lim.fomo} slot="fomo" /></Card>
        </div>

        {loading && <p className="text-sm text-slate-400">Scanning on-chain history. This can take up to ~30 seconds on free infrastructure…</p>}
        {loading && !data && <div className="space-y-3" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl border border-white/10 bg-panel/60" />)}</div>}
        <BurnSchedule wallets={wallets} />

        {data && <div className={loading ? "opacity-60 transition" : "transition"}><Results data={data} /></div>}

        <footer className="border-t border-line pt-5 text-xs leading-relaxed text-slate-500">
          Reflect is a journaling tool, not financial advice.
        </footer>
      </main>
    </div>
  );
}
