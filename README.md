# Reflect
Next.js 14 (App Router) + TypeScript + Tailwind. Run: `npm install && npm run dev`.
- Optional: copy `.env.example` to `.env.local` and set `HELIUS_API_KEY` (otherwise mock data is used).
- Deploy: push to GitHub, import in Vercel, add `HELIUS_API_KEY` env var.
- Map: `lib/helius.ts` (data) · `lib/analyze.ts` (metrics, patterns, tips, comparison) · `lib/tiers.ts` ($REFLECT gate) · `api/analyze/route.ts` · `app/page.tsx` (UI).
