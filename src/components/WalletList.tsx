"use client";
import { useEffect, useRef, useState } from "react";

const ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/; // base58 Solana address
const HANDLE = /^@?\w{2,30}$/; // FOMO handle, "@" optional
type Mode = "address" | "handle";

// Pulls an address out of pasted text, e.g. a pump.fun profile link.
const findAddress = (t: string) => t.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/g)?.find((m) => ADDR.test(m));

type Provider = { connect: () => Promise<{ publicKey?: { toString(): string } } | void>; publicKey?: { toString(): string } };
type Wallet = "phantom" | "solflare";
const WALLETS: Record<Wallet, { label: string; url: string; browse: string; get: () => Provider | undefined }> = {
  phantom: {
    label: "Phantom", url: "https://phantom.app/download", browse: "https://phantom.app/ul/browse/",
    get: () => { const w = window as unknown as { phantom?: { solana?: Provider }; solana?: Provider & { isPhantom?: boolean } }; return w.phantom?.solana ?? (w.solana?.isPhantom ? w.solana : undefined); },
  },
  solflare: {
    label: "Solflare", url: "https://solflare.com/download", browse: "https://solflare.com/ul/v1/browse/",
    get: () => { const w = window as unknown as { solflare?: Provider & { isSolflare?: boolean } }; return w.solflare?.isSolflare ? w.solflare : undefined; },
  },
};

/**
 * Add/remove list with a toggle: track a Solana wallet address OR a FOMO account handle.
 * Handles are stored as "@name" and resolved to a wallet server-side (lib/handles.ts).
 */
export function WalletList({ items, setItems, max, slot, connect = true, empty }: { items: string[]; setItems: (v: string[]) => void; max: number; slot: string; connect?: boolean; empty?: string }) {
  const [mode, setMode] = useState<Mode>("handle"), [v, setV] = useState(""), [err, setErr] = useState(""), [limit, setLimit] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const validate = (raw: string, m: Mode) => {
    const x = raw.trim();
    if (!x || findAddress(x)) return "";
    if (m === "address") return ADDR.test(x) ? "" : "That doesn't look like a Solana address (32–44 characters, no 0, O, I or l).";
    return HANDLE.test(x) ? "" : "FOMO handles are 2–30 letters, numbers or underscores, e.g. @yourhandle.";
  };
  const add = (raw = input.current?.value ?? v, m: Mode = mode) => {
    let x = raw.trim();
    if (!x) return setErr(m === "address" ? "Paste a Solana address or pump.fun link first." : "Type a FOMO handle first, e.g. @yourhandle.");
    const address = findAddress(x);
    if (address) x = address;
    else if (m === "address") return setErr(validate(x, m));
    else { if (!HANDLE.test(x)) return setErr(validate(x, m)); x = `@${x.replace(/^@/, "")}`; }
    if (items.some((i) => i.toLowerCase() === x.toLowerCase())) return setErr("Already added.");
    // PREMIUM HOOK: the cap comes from lib/tiers.ts; $REFLECT holders get a higher one.
    if (items.length >= max) { setErr(""); return setLimit(true); }
    setItems([...items, x]); setV(""); if (input.current) input.current.value = ""; setErr("");
  };
  const latest = useRef({ items, add });
  latest.current = { items, add };
  const connectWallet = async (k: Wallet) => {
    const { label, url, browse, get } = WALLETS[k], p = get();
    if (!p) {
      // Mobile browsers have no wallet extension: reopen this page inside the wallet app's own browser.
      if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        // The wallet's browser reopens this URL; the effect below sees ?connect= and connects without another tap.
        const u = new URL(window.location.href);
        u.searchParams.set("connect", `${k}:${slot}`);
        const here = encodeURIComponent(u.toString());
        window.location.href = `${browse}${here}?ref=${encodeURIComponent(window.location.origin)}`;
        return;
      }
      window.open(url, "_blank", "noopener");
      return setErr(`${label} wasn't found in this browser. Install the extension (or unlock it), then reload and try again.`);
    }
    try { const r = await p.connect(); const a = (r && r.publicKey ? r.publicKey : p.publicKey)?.toString(); if (a) latest.current.add(a, "address"); else setErr(`${label} didn't return an address.`); }
    catch { setErr(`${label} connection was cancelled.`); }
  };
  const pasteClipboard = async () => {
    try { const t = await navigator.clipboard.readText(); const a = findAddress(t); if (a) add(a, "address"); else setErr("No Solana address found on your clipboard."); }
    catch { setErr("Couldn't read the clipboard. Paste into the box instead."); }
  };
  useEffect(() => {
    const u = new URL(window.location.href), [k, target] = (u.searchParams.get("connect") || "").split(":");
    if (target !== slot || !(k in WALLETS)) return;
    let stop = false;
    (async () => {
      // Wallet browsers inject their provider a moment after load.
      for (let i = 0; i < 30 && !WALLETS[k as Wallet].get() && !stop; i++) await new Promise((r) => setTimeout(r, 100));
      if (stop) return;
      u.searchParams.delete("connect");
      window.history.replaceState(null, "", u.toString());
      setMode("address");
      await connectWallet(k as Wallet);
    })();
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const tab = (m: Mode, label: string) => (
    <button type="button" onClick={() => { setMode(m); setErr(validate(v, m)); }} aria-pressed={mode === m}
      className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${mode === m ? "bg-accent/20 text-white shadow-inner" : "text-slate-400 hover:text-white"}`}>{label}</button>
  );
  return (
    <div>
      <div role="group" aria-label="Track by" className="mb-3 flex gap-1 rounded-lg border border-line bg-ink/70 p-1">{tab("handle", "FOMO handle")}{tab("address", "Solana address")}</div>
      <form onSubmit={(e) => { e.preventDefault(); add(); }} className="flex gap-2">
        <input ref={input} value={v} onChange={(e) => { setV(e.target.value); setErr(validate(e.target.value, mode)); }} spellCheck={false} autoCapitalize="none" autoCorrect="off" aria-invalid={!!err}
          placeholder={mode === "handle" ? "@yourhandle" : "Paste a Solana address or pump.fun link"} aria-label={mode === "handle" ? "FOMO handle" : "Solana address"}
          className="min-w-0 flex-1 rounded-lg border border-line bg-ink px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-600 focus:border-accent focus:shadow-glow" />
        <button type="button" onClick={(e) => { e.preventDefault(); add(); }} className="btn-neon rounded-lg px-4 text-sm">Add</button>
      </form>
      {mode === "address" && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {connect && (Object.keys(WALLETS) as Wallet[]).map((k) => (
            <button key={k} type="button" onClick={() => connectWallet(k)} className="rounded-lg border border-line bg-ink/70 px-3 py-2 text-xs text-slate-200 transition hover:border-accent">Connect {WALLETS[k].label}</button>
          ))}
          <button type="button" onClick={pasteClipboard} className="col-span-2 rounded-lg border border-line bg-ink/70 px-3 py-2 text-xs text-slate-200 transition hover:border-accent">Paste from clipboard</button>
        </div>
      )}
      {err && <p aria-live="polite" className="mt-2 text-xs text-loss">{err}</p>}
      <ul className="mt-3 space-y-1.5">
        {!items.length && empty && <li className="rounded-lg border border-dashed border-line px-3 py-3 text-sm text-slate-400">{empty}</li>}
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
      {limit && (
        <div role="dialog" aria-modal="true" aria-labelledby="limit-title" onClick={() => setLimit(false)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-xl border border-line bg-ink p-5 shadow-glow">
            <h3 id="limit-title" className="text-base font-semibold text-white">Wallet limit reached</h3>
            <p className="mt-2 text-sm text-slate-300">{max > 2 ? `You can track up to ${max} wallets here.` : `The free tier tracks up to ${max} wallets here. Holding $REFLECT unlocks up to 6.`}</p>
            <button autoFocus onClick={() => setLimit(false)} className="btn-neon mt-4 w-full rounded-lg px-4 py-2 text-sm">Got it</button>
          </div>
        </div>
      )}
    </div>
  );
}
