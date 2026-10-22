# Reflect
AI-assisted Solana trading journal. Next.js 14 (App Router) + TypeScript + Tailwind.

## Run
`npm install && npm run dev` → http://localhost:3000.

## Config (`.env.local`, see `.env.example`)
- `HELIUS_API_KEY` — real swap history via Helius. Required; there is no sample data.
- `FOMOLENS_KEY` (optional) — third-party paid service that resolves FOMO handles to wallets. Users can also just paste their FOMO wallet address, which needs no key.
- `OPENAI_API_KEY` (optional) — LLM-written journal entry; otherwise a template entry is used.

## Deploy
Push to GitHub, import in Vercel, add the env vars above.

## Map
- `src/lib/helius.ts` — data fetch, fills → positions, Jupiter pricing for unrealized PnL
- `src/lib/analyze.ts` — metrics, pattern detection (tunable thresholds), tips, FOMO comparison
- `src/lib/llm.ts` — optional LLM journal
- `src/lib/tiers.ts` — free-tier limits; `getTier()` is the $REFLECT token-gate hook
- `src/app/api/analyze/route.ts` — validated API route enforcing tier limits
- `src/app/page.tsx` — dashboard UI (wallets are stored in localStorage)

## Known limits
- Trades are detected from net token flow per transaction (SOL/USDC/USDT quotes, pump.fun, aggregators). Scans the latest `HELIUS_MAX_TXS` transactions per wallet (default 2000, max 5000; more = slower).
- Stablecoin amounts are converted at the current SOL price and shown in USD, so absolute PnL is approximate. Win rate and hold times are unaffected.
- FOMO also has an EVM wallet per user; only the Solana wallet is analyzed.
- `@handle` lookups need `FOMOLENS_KEY` or `FOMO_HANDLE_MAP`.

## Running on free plans (public launch checklist)

Reflect is built to survive a crowd on free tiers (Vercel Hobby, Helius free, FomoLens trial):

- **Env vars on Vercel:** set `HELIUS_API_KEY` and `FOMOLENS_KEY` (Project → Settings → Environment Variables). Never commit `.env.local`.
- **Caching:** wallet results are cached 10 min per server instance and concurrent scans of one wallet are shared; FomoLens handle → wallet lookups are cached for a week in Vercel's data cache, so each handle costs credits only once.
- **Quota guards:** per-IP rate limit (6/min), a 10 s refresh cooldown in the UI, capped Helius concurrency with 429 retry/backoff, and daily caps (`DAILY_ANALYSIS_CAP`, `FOMOLENS_DAILY_CAP`). Past a cap users get a friendly "at capacity" message and can paste a wallet address (which costs no FomoLens credits).
- **Honest failures:** there is no sample/mock data. If a wallet or handle fails, users see a clear error instead of fake numbers.
- **Depth vs. cost:** `HELIUS_MAX_TXS` defaults to 2000 (up to ~20 Helius calls, with a 40 s scan budget). `maxDuration` is 60 s, which fits Vercel Hobby.
- **Limits to know:** counters/caches are per serverless instance, so limits are approximate. FomoLens trial credits (~10 per new handle) will run out; encourage address mode or move to a paid key.
- **Scaling up with creator fees:** upgrade Helius, buy FomoLens credits, then swap the in-memory limiter/cache in `src/lib/guard.ts` for Upstash/Vercel KV and raise the caps.

## Soft launch checklist
1. Push to GitHub and import the repo in Vercel (Hobby plan is fine).
2. Add env vars: `HELIUS_API_KEY`, `FOMOLENS_KEY`, `NEXT_PUBLIC_SITE_URL` (optional: `OPENAI_API_KEY`).
3. Deploy, then analyze a real handle on the live URL to confirm it works within the time limit.
4. Share with a small group first. Watch Helius and FomoLens usage dashboards; raise or lower `DAILY_ANALYSIS_CAP` / `FOMOLENS_DAILY_CAP` to match.
5. As traction grows: upgrade Helius, buy FomoLens credits, and move limits/caches to Upstash/Vercel KV (see `src/lib/guard.ts`). `getTier()` in `src/lib/tiers.ts` is where $REFLECT token-gating plugs in.