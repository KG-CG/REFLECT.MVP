import type { ReactNode } from "react";

export function Card({ title, subtitle, action, children, id }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="rounded-2xl border border-white/10 bg-panel/70 p-4 shadow-xl shadow-black/40 backdrop-blur-md sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-white">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export type Tone = "good" | "bad" | "neutral";
const toneClass: Record<Tone, string> = { good: "text-win", bad: "text-loss", neutral: "text-white" };

export function Stat({ label, value, hint, tone = "neutral" }: { label: string; value: string; hint?: string; tone?: Tone }) {
  return (
    <div className="rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-3.5">
      <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${toneClass[tone]}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function SourceBadge() {
  return <span className="shrink-0 whitespace-nowrap rounded-full bg-win/10 px-2 py-0.5 text-[11px] font-medium text-win">● Live</span>;
}

export const fmtMin = (n: number) => (n >= 120 ? `${(n / 60).toFixed(1)} h` : `${Math.round(n)} min`);
