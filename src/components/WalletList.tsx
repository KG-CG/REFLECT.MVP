"use client";
import { useState } from "react";

const ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/; // base58 Solana address
const HANDLE = /^@?\w{2,30}$/; // FOMO handle, "@" optional
type Mode = "address" | "handle";

// Pulls an address out of pasted text, e.g. a pump.fun profile link.
const findAddress = (t: string) => t.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/g)?.find((m) => ADDR.test(m));

type Provider = { isPhantom?: boolean; connect: () => Promise<{ publicKey?: { toString(): string } } | void>; publicKey?: { toString(): string } };
const getPhantom = (): Provider | undefined => {
  const w = window as unknown as { phantom?: { solana?: Provider }; solana?: Provider };
  return w.phantom?.solana ?? (w.solana?.isPhantom ? w.solana : undefined);
};

/**
 * Add/remove list with a toggle: track a Solana wallet address OR a FOMO account handle.
 * Handles are stored as "@name" and resolved to a wallet server-side (lib/handles.ts).
 */
export function WalletList({ items, setItems, max }: { items: string[]; setItems: (v: string[]) => void; max: number }) {
  const [mode, setMode] = useState<Mode>("handle"), [v, setV] = useState(""), [err, setErr] = useState("");
  const add = (raw = v) => {
    let x = raw.trim();
    if (!x) return;
    if (mode === "address") { x = findAddress(x) ?? x; if (!ADDR.test(x)) return setErr("That doesn't look like a Solana address (32–44 characters)."); }
    else { if (!HANDLE.test(x)) return setErr("FOMO handles are letters, numbers and underscores."); x = `@${x.replace(/^@/, "")}`; }
    if (items.some((i) => i.toLowerCase() === x.toLowerCase())) return setErr("Already added.");
    // PREMIUM HOOK: the cap comes from lib/tiers.ts; $REFLECT holders get a higher one.
    if (items.length >= max) return setErr(`Free tier allows ${max}. $REFLECT holders unlock more.`);
    setItems([...items, x]); setV(""); setErr("");
  };
  const connectPhantom = async () => {
    const ph = getPhantom();
    if (!ph) { window.open("https://phantom.app/download", "_blank", "noopener"); return setErr("Phantom wasn't found. Install it, then try again."); }
    try { const r = await ph.connect(); const a = (r && r.publicKey ? r.publicKey : ph.publicKey)?.toString(); if (a) add(a); else setErr("Phantom didn't return an address."); }
    catch { setErr("Phantom connection was cancelled."); }
  };
  const pasteClipboard = async () => {
    try { const t = await navigator.clipboard.readText(); const a = findAddress(t); if (a) add(a); else setErr("No Solana address found on your clipboard."); }
    catch { setErr("Couldn't read the clipboard. Paste into the box instead."); }
  };
  const tab = (m: Mode, label: string) => (
    <button type="button" onClick={() => { setMode(m); setErr(""); }} aria-pressed={mode === m}
      className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${mode === m ? "bg-accent/20 text-white shadow-inner" : "text-slate-400 hover:text-white"}`}>{label}</button>
  );
  return (
    <div>
      <div role="group" aria-label="Track by" className="mb-3 flex gap-1 rounded-lg border border-line bg-ink/70 p-1">{tab("handle", "FOMO handle")}{tab("address", "Solana address")}</div>
      <form onSubmit={(e) => { e.preventDefault(); add(); }} className="flex gap-2">
        <input value={v} onChange={(e) => { setV(e.target.value); setErr(""); }} spellCheck={false} autoCapitalize="none" autoCorrect="off"
          placeholder={mode === "handle" ? "@yourhandle" : "Paste a Solana address or pump.fun link"} aria-label={mode === "handle" ? "FOMO handle" : "Solana address"}
          className="min-w-0 flex-1 rounded-lg border border-line bg-ink px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-600 focus:border-accent focus:shadow-glow" />
        <button type="submit" className="btn-neon rounded-lg px-4 text-sm">Add</button>
      </form>
      {mode === "address" && (
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={connectPhantom} className="flex-1 rounded-lg border border-line bg-ink/70 px-3 py-2 text-xs text-slate-200 transition hover:border-accent">Connect Phantom</button>
          <button type="button" onClick={pasteClipboard} className="flex-1 rounded-lg border border-line bg-ink/70 px-3 py-2 text-xs text-slate-200 transition hover:border-accent">Paste from clipboard</button>
        </div>
      )}
      {err && <p role="alert" className="mt-2 text-xs text-loss">{err}</p>}
      <ul className="mt-3 space-y-1.5">
        {items.map((a) => {
          const isHandle = a.startsWith("@");
          return (
            <li key={a} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-ink/60 px-3 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wider ${isHandle ? "bg-neon/15 text-neon" : "bg-accent/20 text-accent"}`}>{isHandle ? "FOMO" : "SOL"}</span>
                <span className="truncate font-mono text-slate-200" title={a}>{isHandle ? a : `${a.slice(0, 6)}…${a.slice(-6)}`}</span>
              </span>
              <button onClick={() => setItems(items.filter((i) => i !== a))} className="shrink-0 text-xs text-slate-500 transition hover:text-loss" aria-label={`Remove ${a}`}>Remove</button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-slate-500">{items.length} of {max} used</p>
    </div>
  );
}
