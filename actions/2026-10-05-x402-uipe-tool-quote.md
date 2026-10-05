---
date: 2026-10-05
classification: research
action: Read the x402 spec and sketch whether a UIPE tool call could emit/consume a 402 quote.
source_brief: briefs/2026-10-05.md
---

## TL;DR
Yes — and it's not a hand-roll. Coinbase shipped an **official x402 MCP transport**: a tool *emits* a quote by returning `isError: true` + a `PaymentRequired` payload (MCP's equivalent of HTTP 402), and a client *consumes* it by retrying the same call with a payment attached at `_meta["x402/payment"]`. The `@x402/mcp` `wrapMCPClientWithPayment` wrapper + CDP-managed wallet makes both sides a few lines, no private-key handling. So a UIPE perception tool can become "one of the 28" with an afternoon of plumbing. **But x402 is commodity — 28 servers already have it. The moat is the perception trace, not the payment rail.** Ship it as table-stakes, keep the differentiation in UIPE's output. And pressure-test whether per-call micropayments even pencil for high-volume perception calls vs. a flat sub.

## Key findings
- **Emit = tool result, not HTTP status.** Over MCP, the 402 is carried in the wire format: `isError: true` + `PaymentRequired` payload. The client retries with payment at `_meta["x402/payment"]`; server returns real result + settlement at `_meta["x402/payment-response"]`. (source: https://docs.cdp.coinbase.com/x402/mcp-server)
- **The wrapper is one install.** `npm i @coinbase/cdp-sdk @modelcontextprotocol/sdk @x402/core @x402/evm @x402/mcp`; `wrapMCPClientWithPayment(client)` makes payment transparent; `CdpX402Client` provisions a wallet lazily and signs automatically — no key management. (source: docs/mcp-server)
- **Discovery is free and public.** Bazaar MCP server at `https://api.cdp.coinbase.com/platform/v2/x402/discovery/mcp` (unauthenticated) exposes 3 tools incl. `proxy_tool_call`. Listing UIPE = how buyers find it. (source: docs/mcp-server)
- **Schemes fit UIPE's shape.** `exact` (pay a fixed price per call — e.g. $X per perception run) ships today; a theoretical `upto` meters variable consumption like LLM tokens. For v1, `exact` per-call is the billable path. (source: https://github.com/coinbase/x402 README)
- **x402 is credential-agnostic** — payment rides as a separate authorization, independent of identity. That matches the prior decision: ride OAuth 2.1 for identity, bolt x402 for payment, never couple them. (source: [[2026-10-02-uipe-did-vs-oauth-billing]])

## Existing players / prior art
- x402 Foundation / Coinbase — the standard + `@x402/mcp` transport + Bazaar — https://github.com/coinbase/x402
- Anchor Terminal — 28/462 graded MCP servers already accept x402 (the "28") — grades agent-readiness + x402 support
- Headroom — the MCP tool-triple shape to copy; cautionary tale that metering *requires* a server-side chokepoint — [[2026-09-28-headroom-mcp-monetization]]

## Concrete next steps for Dirk
1. **Spike it on testnet ($0).** Stand up a throwaway remote MCP server with one tool, wrap server-side so it returns `PaymentRequired`, wrap a client with `wrapMCPClientWithPayment` + a CDP wallet on **Base Sepolia**. Confirm the emit→pay→settle loop end-to-end before touching UIPE.
2. **Point the quote at a real UIPE tool.** Make `uipe_perceive` (or the action-receipt tool) the paid surface — it must run on infra *you* control so the meter is server-side and trustworthy (the headroom lesson).
3. **Price `exact` per-call, not %-of-value.** Per-call USDC is billable today; savings-cut needs adversary-resistant counterfactual measurement — skip for v1.
4. **List on the Bazaar** so the 28→29 move is discoverable, not just technically true.

## Open questions
- Do high-volume perception calls survive per-call micropayment overhead (gas abstraction aside, wallet/UX + accounting), or is x402 better as a *metered-session* entry than per-call?
- Does `upto` (variable metering) ship before you'd want to bill per-perception-cost rather than flat-per-call?
