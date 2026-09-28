---
date: 2026-09-28
classification: research
action: Skim headroom's MCP server design as prior art for the "MCP tool that saves money, charges a cut" model (MCPAASTA); note how they wrap compress/retrieve/stats.
source_brief: briefs/2026-09-28.md
---

## TL;DR
Headroom's MCP server is a clean, copyable template for the **tool-triple** pattern — `compress` (transform), `retrieve` (reversibility escape hatch), `stats` (prove-the-value). Study the shape; it's the best-shipped example of an MCP tool whose whole pitch is "I save you tokens." **But it is NOT a "charges a cut" model.** Headroom is Apache-2.0, runs 100% locally ("compression runs on your machine; no content is sent anywhere"), and captures $0 of the savings it computes. MCPAASTA's monetization thesis is the part headroom deliberately *doesn't* build — so treat it as a design reference for the tool surface, and a cautionary case that the "cut" requires hosting the value-add server-side, which headroom refuses to do on privacy grounds.

## Key findings
- **The tool triple is the reusable shape.** `headroom_compress(content)` → `{compressed, hash, original_tokens, compressed_tokens, savings_percent, transforms}`; `headroom_retrieve(hash, query?)` → original or filtered results; `headroom_stats()` → session totals. (source: https://docs.headroomlabs.ai/docs/mcp)
- **Reversibility is the trust primitive.** Every compression returns a `hash`; originals are cached locally with a 1-hour TTL and re-fetched on demand via `retrieve`. Lossy transform becomes safe *because* the escape hatch exists — this is why the LLM is willing to call `compress`. (source: docs/mcp)
- **`stats` is the value-proof surface** and already emits `estimated_cost_saved_usd` — the natural billing basis for a "cut." But it's computed **client-side and self-reported**, so it's un-trustworthy as a billing meter. (source: docs/mcp)
- **No pricing, billing, or revenue anywhere.** grep across the full docs blob (`llms-full.txt`) for price/charge/billing/revenue/paid returned nothing — only "local-first," "your data stays here," Apache-2.0, PyPI/npm. The monetization is your idea, not theirs. (source: https://docs.headroomlabs.ai/llms-full.txt, README)
- **Deployment is per-session-local by design:** "run one local proxy or MCP process per user session; do not assume a central proxy." That architecture has no chokepoint to meter or bill. (source: docs/mcp architecture)

## Existing players / prior art
- **Headroom** — local token-compression as library / proxy / MCP; free & open. The MCP tool design to copy, not the business model. — https://github.com/headroomlabs-ai/headroom

## Concrete next steps for Dirk
1. **Copy the tool-triple contract, not the code.** Any MCPAASTA tool that saves money should ship the same three surfaces: a transform tool that returns a reversible handle, a `retrieve(handle)` escape hatch, and a `stats` tool that quantifies savings. Headroom proves users/agents adopt this shape.
2. **Decide the metering point first — it's the whole business.** Headroom can't charge because compute is local. MCPAASTA must run the value-add on infra *you* control (hosted MCP/proxy) so savings are measured server-side and verifiably, not self-reported. Write that constraint down before designing anything.
3. **Pressure-test "charge a cut of savings" vs. flat/usage pricing.** A savings-cut needs a trusted, adversary-resistant measurement of counterfactual token spend. That's hard. Consider per-call or per-token-processed pricing as the v1 that's actually billable, with "savings" as marketing not the invoice.

## Open questions
- Can savings be measured trustworthily enough to bill a % on, or does that require the customer to route *all* traffic through you (which they resist for privacy — headroom's whole differentiator)?
- Is there any MCP tool in the wild that actually charges (Stripe-metered MCP)? Headroom isn't it; worth a separate 20-min scan before committing to the "cut" model.
