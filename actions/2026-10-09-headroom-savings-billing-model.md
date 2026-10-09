---
date: 2026-10-09
classification: research
action: Read headroom's MCP + pricing model as the closest live example of billing an MCP server on measurable savings (the MCPAASTA shape for UIPE).
source_brief: briefs/2026-10-09.md
---

## TL;DR
The premise is wrong in a useful way. Headroom does **not** bill on measurable savings. It's Apache-2.0 OSS (library + proxy + MCP server, 74.8k stars) with a conventional **12-month Enterprise contract priced >$10k/yr** on top. "Measurable savings" is their **sales wedge, not their billing basis** — a shadow mode that proves token savings *before* you buy, then an annual flat contract. So the honest lesson for UIPE/MCPAASTA: savings-based *pricing* is still an open field; what headroom nails is savings-based *proof*. Copy the proof mechanism (shadow mode + `headroom savings` on your own traffic), not a billing model they chose to avoid.

## Key findings
- Headroom's product is token compression of everything an agent reads (tool outputs, logs, RAG, files) before it hits the LLM — library, proxy, agent-wrap, and MCP server all in one. (source: https://github.com/headroomlabs-ai/headroom)
- The MCP server exposes exactly three tools: `headroom_compress`, `headroom_retrieve`, `headroom_stats`. Compression runs locally; no content leaves the machine. (source: raw README)
- Billing is a classic annual B2B contract: "12-month Headroom Enterprise contract with a total value over $10,000," one perk per company. No per-token, no %-of-savings, no usage meter. (source: https://headroom-perks.vercel.app/?source=github)
- OSS vs Enterprise is gated by *features* (tool search for all models, auto model-routing, prompt-injection stripping, SSO/VPC), not by savings captured. (source: README "Headroom for teams" table)
- Their killer sales move is **shadow mode**: "a cheaper model per request when quality allows, with a shadow mode that shows the savings before you turn it on," plus `headroom savings` run against your own traffic. Value is proven on the buyer's real data pre-purchase. (source: README)
- Savings are framed as "a shape, not a promise" — 21% code search, 57% SRE logs, varies with payload repetitiveness. They deliberately avoid promising a number, which is *why* they can't bill on it. (source: docs.headroomlabs.ai/docs)

## Existing players / prior art
- Headroom — compression layer, OSS + annual Enterprise contract, savings as proof not price — https://github.com/headroomlabs-ai/headroom
- (Gap) No live example found in this pass of an MCP server that bills a *cut of measured savings*. Attribution ("did the savings come from us?") is the unsolved problem everyone routes around with flat contracts.

## Concrete next steps for Dirk
1. Drop the assumption that headroom = savings-based billing. It's proof-based selling + annual contract. Decide if UIPE wants the *billing* innovation (hard, unproven) or the *proof* innovation (headroom-validated, copyable now).
2. Steal the shadow-mode pattern for UIPE: let a prospect run UIPE against their own traffic read-only and see the savings number before paying. That's the wedge that makes the sale, regardless of billing model.
3. If you still want outcome-based billing, write down how UIPE *attributes* a saving to itself defensibly (counterfactual baseline, tamper-resistant meter). If you can't answer that in a paragraph, default to headroom's annual-contract model and compete on proof instead.

## Open questions
- Can UIPE's "savings" be metered in a way a customer finance team trusts enough to pay a % on? Headroom's choice suggests the answer is usually no — worth confirming for UIPE's specific metric.
- Is UIPE's value per-request (like compression) or per-outcome? That determines whether a meter is even conceptually possible.
