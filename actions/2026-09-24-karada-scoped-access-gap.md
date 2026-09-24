---
date: 2026-09-24
classification: research
action: Map what Karada.ai charges for and where the scoped-access/metering gap is that MCPAASTA would own instead.
source_brief: briefs/2026-09-24.md
---

## TL;DR
Karada is an **OpenAPI→Go-MCP compiler + multiplexing gateway** — dev-facing *build/host/route* infra. It meters **you, the workspace owner**, against flat monthly plans (Hobby free / Pro ~$20 / Enterprise custom) with request quotas (10k / 100k / 10M+). Its "usage" is **observability only** (a dashboard of invocations/bandwidth/error-rate over 30 days) and its access control is **per-gateway tokens + global tool on/off toggles**. The gap MCPAASTA owns: there is **no per-consumer metering, no usage-based billing passthrough, and no per-key scoping/quotas** — i.e. no rail for *governing and monetizing MCP access you resell to third parties*. Don't try to out-host Karada; build the metering/access layer that sits beside it.

## Key findings
- Pricing is tiered **flat subscription**, not usage-based: Hobby $0, Gateway Pro $19, All-Access Pro $49 on the site (source: https://karada.ai/pricing). Docs show a *different* table ($20 Pro, 100→1000→10000 servers) — their pricing is still in flux, a signal they haven't nailed monetization. (source: https://docs.karada.ai/features/usage-billing.md)
- Metering = **telemetry, not billing**. They track tool invocations/bandwidth/error-rate for *your* dashboard; there's no meter that attributes calls to a downstream customer or bills per-call. (source: https://docs.karada.ai/features/usage-billing.md)
- Access control is **coarse**: each gateway gets one scoped auth token; tools are enable/disable toggles; secrets live in one shared AES-256 vault injected at the edge for *all* callers of that gateway. No per-token tool scoping, no per-consumer quota, no end-user OAuth delegation. (source: https://docs.karada.ai/features/gateway.md)
- Rate limiting is a **plugin**, not a first-class access primitive — confirms scoped/metered access is not core to their model. (source: https://docs.karada.ai/llms.txt → features/plugins.md)
- Their whole positioning is "your product on every AI platform" (compile + multiplex + host). Monetizing *other people's* consumption of your tools is out of scope. (source: https://karada.ai)

## Existing players / prior art
- Karada.ai — OpenAPI→MCP compiler + unified gateway, flat-tier billing — https://karada.ai
- Rate-limiting/analytics plugins (Karada's own) — bolt-ons, not a billing rail — https://docs.karada.ai/features/plugins.md
- (Adjacent, not fetched) Stripe metered billing + API-key-per-consumer is the mental model MCPAASTA would port to MCP.

## Concrete next steps for Dirk
1. **Reframe MCPAASTA as a layer, not a host.** Pitch: "Stripe-metering + per-key scopes/quotas for MCP tool access." It wraps or sits in front of any MCP server (including Karada-hosted ones), so Karada is a channel, not a competitor.
2. **Validate the reseller persona.** The gap only matters if people are *reselling* MCP tool access to third parties. Spend 20 min in Karada's Discord + MCP subreddits looking for "how do I bill my users for tool calls" — if nobody's asking, the gap is real but not yet painful.
3. **Spec the thin wedge:** issue per-consumer keys → enforce per-key tool scopes + call quotas → emit a metered usage event per call. That's the first PR; billing integration comes after.

## Open questions
- Is anyone actually *reselling* MCP access yet, or is the market still internal-tools-only? (Determines if metering is a now-problem or a 2027-problem.)
- Does Karada's roadmap already point at usage-based billing? Their two conflicting pricing tables suggest they're circling it — if they ship it, the wedge closes.
