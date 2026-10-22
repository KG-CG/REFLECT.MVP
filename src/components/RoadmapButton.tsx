"use client";
import { useEffect, useState } from "react";
import type { Phase } from "@/lib/roadmap";

/** Holders-only "Roadmap" button + dialog. Renders nothing unless the server confirms the user holds $REFLECT. */
export function RoadmapButton({ wallets }: { wallets: string[] }) {
  const [phases, setPhases] = useState<Phase[] | null>(null), [open, setOpen] = useState(false);
  useEffect(() => {
    const addrs = wallets.filter((w) => !w.startsWith("@"));
    if (!addrs.length) { setPhases(null); setOpen(false); return; }
    let stop = false;
    fetch("/api/roadmap", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallets: addrs }) })
      .then((r) => (r.ok ? r.json() : null)).then((j) => { if (!stop) setPhases(j?.phases ?? null); }).catch(() => {});
    return () => { stop = true; };
  }, [wallets]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [open]);
  if (!phases) return null;
  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded-lg border border-neon/40 bg-neon/10 px-3 py-2 text-sm text-neon transition hover:bg-neon/20">Roadmap</button>
      {open && (
        <div role="dialog" aria-modal="true" aria-labelledby="roadmap-title" onClick={() => setOpen(false)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div onClick={(e) => e.stopPropagation()} className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-xl border border-line bg-ink p-5 shadow-glow">
            <div className="flex items-start justify-between gap-3">
              <div><h2 id="roadmap-title" className="text-lg font-semibold text-white">Reflect Roadmap</h2><p className="text-xs text-slate-500">For $REFLECT holders. A plan, not a guarantee.</p></div>
              <button onClick={() => setOpen(false)} aria-label="Close roadmap" className="text-slate-400 transition hover:text-white">✕</button>
            </div>
            <div className="mt-4 space-y-5">
              {phases.map((p) => (
                <section key={p.id}>
                  <h3 className="text-sm font-semibold text-white">{p.title} <span className="ml-1 rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-medium text-accent">{p.when}</span></h3>
                  <p className="mt-1 text-sm text-slate-400">{p.intro}</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">{p.items.map((i) => <li key={i}>{i}</li>)}</ul>
                  <p className="mt-2 text-sm text-neon"><span className="font-semibold">Goal:</span> {p.goal}</p>
                </section>
              ))}
            </div>
            <p className="mt-5 text-xs text-slate-500">Not financial advice.</p>
          </div>
        </div>
      )}
    </>
  );
}
