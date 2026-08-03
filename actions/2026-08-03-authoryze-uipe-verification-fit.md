---
date: 2026-08-03
classification: research
action: Read Authoryze's /docs and map their fee/approval model against the MCPAASTA rail; find where UIPE's verification layer slots in above it.
source_brief: briefs/2026-08-03.md
---

## TL;DR
Authoryze (authoryze.ai — the `.com` is a dead park) is a payment **authorization** control plane, not a fulfillment layer. It issues single-use network-tokenized cards (Basis Theory → Mastercard Agent Pay / Visa Intelligent Commerce, Privacy.com as fallback) and enforces per-agent thresholds, merchant allow/deny lists, and per-txn/daily caps, charging **1.5% / $0.50-min** per transaction on a *separate* Stripe fee card. Its own security page admits the gap you want: it approves purchases on the agent's **self-attested `justification`** and never verifies the purchase actually happened or bought what was claimed. That intent-vs-outcome reconciliation is exactly where UIPE slots in — **but scope it to browser/GUI checkouts**, because Authoryze's own headline examples (OpenAI/Anthropic/Cloudflare API top-ups) are headless API purchases with no confirmation screen to perceive.

## Key findings
- Fee model confirmed: 1.5% or $0.50 min, billed to a distinct Stripe "fee card," never the funding card (source: https://authoryze.ai/docs, Setup step 2).
- Approval = single per-agent **auto-approve threshold**. Under it → auto-approve (rule-checked); over it → human email approval or a passkey-verified "automatic-spending envelope" (source: https://authoryze.ai/docs, Setup steps 4–5).
- Rule surface: `merchant_url` allow/deny with subdomain matching, per-txn limit, daily/monthly caps, `category_hint`. Approval decision reads the agent's own `description` + `justification` — **no independent check that the claim is true** (source: https://authoryze.ai/docs, Available tools → request_purchase).
- 4 MCP tools: `request_purchase`, `check_status`, `retrieve_card` (draw-once, card returned inline), `get_spending_summary`. Endpoint `https://authoryze.ai/api/mcp`, OAuth or Bearer key (source: https://authoryze.ai/docs).
- Authoryze's involvement **ends at card issuance**. It sees the card network auth, never the merchant confirmation. Their Security section explicitly says they do *not* stop prompt-injected `request_purchase` calls and cannot verify fulfillment — the defense is "bounded to one txn at one amount" (source: https://authoryze.ai/docs, Security).
- The receipt nobody issues: a signed artifact reconciling *stated intent* → *actual outcome*. Payment layer can't produce it (only sees the money leg); that's UIPE's opening.

## Existing players / prior art
- Authoryze — MCP-native card control plane, the direct comp — https://authoryze.ai
- Basis Theory agentic card network — the rail *under* Authoryze (Mastercard Agent Pay / Visa Intelligent Commerce) — https://basistheory.com
- Slash for Agents, Privacy.com Agents, Agentcard.sh, Marqeta MCP, Stripe Machine Payments Protocol — all card/spend layers; **none verify fulfillment** — https://www.slash.com/platform/agents
- No payment player found doing intent-vs-confirmation receipts; verification lives in eval/observability, not commerce.

## Concrete next steps for Dirk
1. Position UIPE as a **post-`retrieve_card` verification MCP tool** (`verify_purchase(request_id, session)` → signed receipt matching justification ↔ on-screen confirmation), *complementary* to Authoryze, not competing on the money leg.
2. Scope the perception moat to **browser-checkout agents** (Computer-Use/Operator style). For headless API purchases, the "receipt" is response-parsing, not perception — sell one product, two backends.
3. Draft a one-pager framing the receipt as a **dispute/chargeback + audit primitive** — value concentrates on high-value autonomous spend (their $612 denied-dataset row), not $5 top-ups.

## Open questions
- Would Authoryze partner (they'd want the receipt) or build it themselves once agent commerce matures?
- Does a browser-perception receipt survive when checkout happens inside the agent host (ChatGPT/Claude) with no external screen UIPE can observe?
- Is there real willingness-to-pay for fulfillment verification today, or is it a 12–18-month-early bet on autonomous spend volume?
