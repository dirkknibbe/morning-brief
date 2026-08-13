---
date: 2026-08-13
classification: research
action: Read headroom's MCP-server code — note how it counts and prices token savings; is that mechanic portable to UIPE metered-MCP billing?
source_brief: briefs/2026-08-13-FAILED.md
---

## TL;DR
The brief's premise is half-wrong: headroom is **not** a metered-billing analog. It's Apache-2.0, local-first, free OSS with **no revenue mechanic** — no invoicing, no metering-for-charge, no paid tier. What it actually ships is a **cost-attribution / savings-measurement layer**: it counts tokens before/after per compression and converts the delta to "cost avoided" dollars for a display dashboard. That meter is genuinely portable to UIPE and is the hard part of any billing story — but headroom stops one step short of billing, and the step it skips (turning an estimated meter into a trustworthy invoice) is exactly where UIPE's product risk lives. Steal the meter design; don't assume the billing is solved.

## Key findings
- **Counting = tiktoken diff, per result.** `MCPCompressionResult` records `original_tokens`, `compressed_tokens`, `tokens_saved`, `compression_ratio` via a pluggable `token_counter` (tiktoken default). (source: headroom/integrations/mcp/server.py)
- **Durable meter = append-only ledger.** Both the MCP-tool path and the proxy write to `~/.headroom/savings_events.jsonl`; `headroom savings` aggregates on read into Today/7d/all-time + per-model + per-client bars. This ledger is the reusable primitive. (source: headroom/cli/savings.py)
- **Pricing = display only, not billing.** The `pricing/` module uses LiteLLM's community DB (100+ models) to turn saved **input** tokens into "cost avoided." It exists to render `$0.0850`, not to charge anyone. (source: headroom/pricing/__init__.py, docs/content/docs/savings.mdx)
- **Critical gotcha for a billing model: the MCP path is blind to the upstream model.** MCP-tool compressions record `model="unknown"` and fall back to a *blended per-token rate* (or a `HEADROOM_MCP_MODEL` hint). Only the **proxy** path sees the real model and prices accurately. So savings dollars from an MCP tool are an *estimate you can't independently verify* — fine for a dashboard, unacceptable as an invoice line. (source: docs/content/docs/savings.mdx)

## Existing players / prior art
- **headroom** — compression layer (JSON/AST/text), ships lib+proxy+MCP; measures savings, doesn't bill — github.com/headroomlabs-ai/headroom (dev repo: chopratejas/headroom)
- **a2acompress** — lossless A2A wire compression, 36.6% fewer tokens; also a "same answer, fewer tokens" measurement play, no billing layer shown (from today's brief)
- **LiteLLM pricing DB** — the community token→$ table headroom leans on; the reusable pricing oracle for anyone doing cost-avoided math

## Concrete next steps for Dirk
1. **Lift the ledger pattern, not the pricing.** UIPE's meter should be an append-only `savings_events.jsonl`-style log keyed by (client, model, tokens_before, tokens_after, ts). It's ~50 lines and is the honest foundation for either a dashboard or a bill.
2. **Decide the billing position deliberately: proxy vs MCP-tool.** To bill on *verifiable* savings you need the proxy seat (real model + real token counts). The MCP-tool seat only yields estimates — sellable as "insights," not as metered charges. This is the single most important design fork.
3. **Don't rebuild the token→$ oracle** — depend on LiteLLM's pricing DB as headroom does; it's maintained and covers 100+ models.
4. **Reframe UIPE's wedge:** headroom proves the *meter* is cheap and the *trust* is expensive. UIPE's edge is DOM-to-signal on a payload where UIPE controls both sides — meaning it can measure ground-truth before/after without guessing the model. That's a stronger billing story than headroom's.

## Open questions
- Is anyone actually **charging** on measured token savings yet, or is it universally free/OSS + "cost avoided" theater? (No shipped billing example found today.)
- Would customers accept billing on *estimated* savings, or only on independently reproducible before/after? Determines whether the MCP-tool seat is ever billable.
