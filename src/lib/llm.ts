import type { Report } from "./types";

/**
 * Optional LLM-written journal entry. Set OPENAI_API_KEY (and optionally OPENAI_MODEL) to enable.
 * Only aggregated metrics/patterns are sent, never raw wallet addresses.
 * Returns null on any failure so the caller falls back to the template journal.
 * PREMIUM HOOK: gate this call behind getTier() === "premium" in the API route if desired.
 */
export async function llmJournal(me: Report): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [
          { role: "system", content: "You write short, factual, non-hype trading journal entries (max 120 words). No price predictions, no financial advice. Refer only to the data given." },
          { role: "user", content: JSON.stringify({ metrics: me.metrics, patterns: me.patterns }) },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const j = await res.json();
    return j.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}
