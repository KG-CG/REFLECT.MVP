/**
 * Free-plan protection: a user-facing error type, a tiny TTL cache, a concurrency limiter and a daily budget.
 * All state is in-memory (per server instance). That is enough to stop accidental quota burn on free plans;
 * for hard guarantees across instances, back these with Upstash/Vercel KV.
 */

/** Errors whose message is safe to show to users. `status` is the HTTP status the API returns. */
export class PublicError extends Error {
  readonly isPublic = true;
  constructor(message: string, public status = 502) { super(message); }
}
/** Duck-typed so it still works if the bundler duplicates this module. */
export const isPublicError = (e: unknown): e is PublicError => !!e && (e as PublicError).isPublic === true;

/** Process-wide singleton (survives dev hot reloads / duplicated bundles). */
export function shared<T>(name: string, init: () => T): T {
  const g = globalThis as unknown as Record<string, unknown>;
  return (g[`__reflect_${name}`] ??= init()) as T;
}

export class TtlCache<V> {
  private m = new Map<string, { v: V; exp: number }>();
  constructor(private ttlMs: number, private max = 500) {}
  get(k: string): V | undefined {
    const e = this.m.get(k);
    if (!e) return undefined;
    if (e.exp < Date.now()) { this.m.delete(k); return undefined; }
    return e.v;
  }
  set(k: string, v: V) {
    if (this.m.size >= this.max) this.m.delete(this.m.keys().next().value as string); // drop oldest
    this.m.set(k, { v, exp: Date.now() + this.ttlMs });
  }
}

/** Runs at most `limit` tasks at once; extra callers wait in line. Keeps us under Helius free-plan rate limits. */
export class Limiter {
  private active = 0; private q: (() => void)[] = [];
  constructor(private limit: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((r) => this.q.push(r));
    this.active++;
    try { return await fn(); } finally { this.active--; this.q.shift()?.(); }
  }
}

/** Counts uses per UTC day and refuses past `cap`. */
export class DailyBudget {
  private day = ""; private used = 0;
  constructor(private cap: number) {}
  take(n = 1): boolean {
    const d = new Date().toISOString().slice(0, 10);
    if (d !== this.day) { this.day = d; this.used = 0; }
    if (this.used + n > this.cap) return false;
    this.used += n; return true;
  }
}

/** Same in-flight request is shared, so ten people analyzing one wallet cost one upstream scan. */
const inflight = shared("inflight", () => new Map<string, Promise<unknown>>());
export function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = inflight.get(key) as Promise<T> | undefined;
  if (hit) return hit;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p); return p;
}
