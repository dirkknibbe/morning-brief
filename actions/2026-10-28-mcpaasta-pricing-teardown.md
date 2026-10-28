---
date: 2026-10-28
classification: research
action: Teardown of how StoreRouter and Channel3 price their MCP surfaces (live MCPAASTA pricing data for UIPE)
source_brief: briefs/2026-10-28.md
---

## TL;DR
Neither company prices "MCP" as a product. MCP is a free transport skin bolted onto an existing **per-operation meter** — the billable unit is the call (search/lookup), not the protocol. StoreRouter: prepaid credit, $0.014/search, $0.002/lookup, $5 free/month, HTTP 402 when dry. Channel3: 1000 free credits/month then $0.007/credit, with the catalog data itself (products, brands, **variants**) given away free — you only pay to *discover*. The one genuinely novel MCPAASTA primitive is Channel3's **MPP (Machine Payments Protocol / "Pay Per Call")**: an agent pays at call time with no API key and no signup. StoreRouter still needs a human to provision a prepaid org. For UIPE: meter the operation, not the protocol; give away a free tier; and the real moat is agent-native payment, not the MCP endpoint.

## Key findings
- StoreRouter prices per **successful** HTTP 2xx request; retries and pagination each bill. Search $0.014, lookup/parse $0.002. No subscription, prepaid only. (source: https://storerouter.ai/docs/guides/pricing-and-billing.md)
- StoreRouter MCP has **zero separate pricing** — same catalog access policy and meter as the REST API; MCP just removes key management (OAuth browser sign-in, 5-min tokens). (source: https://storerouter.ai/docs/mcp/overview.md)
- Channel3 meters in credits: search/browse/similar/lookup = 1 credit; conversations = 1 credit/turn + the agent's search credits; **products/brands/categories/variants = FREE**. Price-tracking 1 credit/product/day. (source: https://docs.trychannel3.com/pricing)
- Channel3's variant normalization — the headline pitch — is **not the paid unit**. The normalized data is free; you pay for the search that finds it. (source: https://docs.trychannel3.com/pricing)
- Channel3 MPP: "Agents can pay via Machine Payments Protocol — no API key or signup required." This is the actual MCP-as-a-service-to-agents monetization rail; StoreRouter has no equivalent. (source: https://docs.trychannel3.com/pricing)
- Both use an identical free-tier shape to seed adoption: StoreRouter $5/month (expires at renewal), Channel3 1000 credits/month. Picks-and-shovels, land-with-free-tier. (sources above)

## Existing players / prior art
- StoreRouter — "one API for all stores," MCP/CLI/REST/SDK surfaces over a 2.5k-store / 7M-product catalog; markets via comparison pages vs Apify/Bright Data/Firecrawl — https://storerouter.ai
- Channel3 — product graph for agents, variant resolution + commissions + (soon) checkout; MPP pay-per-call — https://trychannel3.com
- MPP / x402-style agent payment — the emerging standard both the Delaware policy note and these APIs point at: agents paying inline, no human account.

## Concrete next steps for Dirk
1. Steal the pricing *shape* for UIPE's MCP surface: meter the expensive operation, give the data/parse away, seed with a fixed monthly free grant — don't invent an "MCP seat" SKU.
2. Decide UIPE's stance on agent-native payment (MPP/x402). That — not the MCP endpoint — is the defensible differentiator. If UIPE requires a human-provisioned key like StoreRouter, it's already behind Channel3 on agent self-service.
3. If chasing an Opportunity Spark (trust oracle / variant-resolution-for-long-tail), price it the same way: free normalized output, metered *query*, MPP so an agent can pay without onboarding.

## Open questions
- Actual $-per-call economics behind Channel3's MPP (the pricing page shows credits, not the MPP settlement price/rail).
- Whether StoreRouter's "no separate MCP pricing" holds under contract/enterprise terms (page says separate contracts override).
- Real agent-side adoption of MPP vs prepaid orgs — is anyone actually paying per-call, or is the free tier carrying all usage?
