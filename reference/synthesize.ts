/**
 * Morning Brief - Synthesizer
 *
 * Feeds raw gathered items into Claude to produce an actionable
 * daily brief focused on agent-ecosystem business opportunities.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { RawItem } from "./sources.ts";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a business intelligence analyst for a solo developer exploring the AI agent services market. Your job is to produce a concise, actionable morning brief.

The developer (Dirk) is:
- Building UIPE, an MCP server that gives AI agents temporal perception of web UIs
- Looking for low-overhead, metered API/service ideas targeting AI agent developers
- Revenue target: even $50-100/month recurring to start
- Stack: TypeScript/Bun, Java/Spring Boot, Kafka, Kubernetes
- Distribution model: MCPAASTA (MCP As A Service To Agents) with micropayment rails

Your brief should:
1. LEAD with the single most interesting opportunity or friction point you spotted
2. Group findings into these sections:
   - 🔥 **Hot Signals** — new tools, launches, or trends worth watching
   - 😤 **Developer Friction** — complaints, pain points, things that are broken or missing (THIS IS WHERE THE MONEY IS)
   - 💰 **Monetization Patterns** — how others are charging, new payment/metering approaches
   - 🛠️ **New MCP/Agent Tools** — repos, frameworks, servers worth examining
   - 💡 **Opportunity Sparks** — your 2-3 concrete micro-SaaS or API service ideas based on today's signals
3. Keep each item to 1-2 lines max
4. End with ONE specific action item Dirk could execute today
5. Use Telegram-compatible markdown (bold with *, no headers with #, use emoji for sections)
6. Total length: 300-500 words. Dense, no fluff.

If the data is thin on a given day, say so honestly and focus on what's interesting.`;

export async function synthesizeBrief(data: {
  hn: RawItem[];
  reddit: RawItem[];
  github: RawItem[];
}): Promise<string> {
  console.log("🧠 Synthesizing brief with Claude...");

  const formatItems = (items: RawItem[]) =>
    items
      .map(
        (i) =>
          `- [${i.source}] "${i.title}" (score:${i.score ?? "?"}, comments:${i.comments ?? "?"}) ${i.url}${i.summary ? `\n  Context: ${i.summary}` : ""}`
      )
      .join("\n");

  const userMessage = `Here is today's raw data gathered from the agent/AI ecosystem. Synthesize this into my morning brief.

=== HACKER NEWS (last 24h) ===
${data.hn.length > 0 ? formatItems(data.hn) : "Nothing notable found today."}

=== REDDIT (last 24h) ===
${data.reddit.length > 0 ? formatItems(data.reddit) : "Nothing notable found today."}

=== GITHUB (last 7 days, sorted by stars) ===
${data.github.length > 0 ? formatItems(data.github) : "Nothing notable found today."}

Today's date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  return text;
}
