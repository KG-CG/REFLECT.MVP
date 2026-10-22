export type Phase = { id: string; title: string; when: string; intro: string; items: string[]; goal: string };

// Served only to $REFLECT holders by /api/roadmap, so it never ships in the public JS bundle.
export const ROADMAP: Phase[] = [
  {
    id: "p1", title: "Phase 1: Polish the Core Product & Prove Value", when: "Next 0–3 months",
    intro: "Focus on reliability and immediate usefulness.",
    items: [
      "Make wallet analysis (Phantom/Solflare connect + paste) fast, accurate on PnL, and clear on “what this cost you.”",
      "Deliver concrete, actionable insights, e.g. “You lost X on revenge trades within 5 minutes of a stop” or “Your FOMO entries after Y% pumps have Z% win rate.”",
      "Token utility basics: holders get multi-wallet tracking (up to six) and priority analysis.",
      "Ship frequent small updates and share real (anonymized) example breakdowns on X to build trust.",
    ],
    goal: "Users who try it come back because it shows them something they didn’t see themselves.",
  },
  {
    id: "p2", title: "Phase 2: Deepen the AI + Add Stickiness", when: "3–9 months",
    intro: "This is where most similar tools either become useful or fade.",
    items: [
      "Expand habit detection: overtrading windows, size creep, late-session damage, copy-trade leaks, and more.",
      "Add comparison features against tracked wallets or successful patterns.",
      "Real-time or near-real-time alerts (“This looks like a FOMO entry based on your history”).",
      "Social/light community features: shareable scorecards, weekly personal reports, or simple challenges.",
      "Freemium model: free basic analysis, with deeper/unlimited or multi-wallet access for holders or a paid tier.",
      "Browser extension or a simple Telegram/Discord bot for easier access.",
    ],
    goal: "Daily/weekly active users who treat it like a coach, not a one-time curiosity.",
  },
  {
    id: "p3", title: "Phase 3: Scale, Data Moat & Sustainability", when: "9–24+ months",
    intro: "Turn a useful tool into a durable business.",
    items: [
      "Expand beyond pure FOMO into a broader Solana (and later multi-chain) trading journal.",
      "Publish anonymized industry insights (“Common pump.fun mistakes costing traders X”) to build authority and free marketing.",
      "Revenue streams: subscription for power users, token-gated features, and potential partnerships (analytics tools, DEXes, or trading bots).",
      "Token evolution: clear utility (access tiers, staking for priority/boosts, or revenue-linked buybacks/burns). Avoid making it purely speculative.",
      "Team/ops: bring in help on AI, data, and growth once product-market fit is clearer. Track retention and “did this actually help you lose less?” feedback.",
    ],
    goal: "A durable product with recurring users and revenue, not dependent on token pumps.",
  },
];
