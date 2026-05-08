---
date: 2026-05-08
classification: build-plan
action: Read x402 spec + AgentCore Payments docs end-to-end; prototype one UIPE tool behind HTTP 402 today.
source_brief: briefs/2026-05-08.md
---

## TL;DR
The x402 wrapper itself is a half-day job — **the real cost is hosted UIPE infra**. x402 v2 is HTTP-native (single-line Express middleware, returns 402 with `PaymentRequirements`, client signs USDC, retries with `PAYMENT-SIGNATURE`). Bazaar listing is automatic on first successful settlement through the CDP Facilitator — no registration, no review. Recommendation: ship a *minimal* HTTP gateway in front of one UIPE tool (`detect_elements`) on Base Sepolia testnet today, planted-flag style. **Skip `get_scene` for v1** — it's stateful, browser-pool-bound, and unprofitable at $0.001/call. Defer mainnet + payable pricing until you've decided whether UIPE-as-paid-API is even the business you want.

## Key findings
- **x402 v2 is dead-simple to integrate**: one middleware line, point at facilitator URL, declare a `payTo` wallet. Returns HTTP 402 + JSON `PaymentRequirements` (scheme/network/amount/asset/payTo). Client retries with signed payload. (source: https://docs.cdp.coinbase.com/x402/quickstart-for-sellers)
- **No registration step for the Bazaar.** CDP Facilitator catalogs endpoints automatically *on first successful settle*, not verify. So presence requires (a) wired-up route, (b) ≥1 paid call landing through `https://api.cdp.coinbase.com/platform/v2/x402`. (source: https://docs.cdp.coinbase.com/x402/bazaar)
- **Testnet path is signup-free**: `https://x402.org/facilitator` on Base Sepolia, no CDP keys. But testnet listings don't appear in the production CDP Bazaar — for actual presence you need CDP keys + mainnet (or whatever the CDP testnet Bazaar is, if it exists). (source: https://docs.cdp.coinbase.com/x402/quickstart-for-sellers)
- **AgentCore Payments is a buyer-side product, not seller-side.** AWS handles wallet/signing/budget for agents calling x402 endpoints. For UIPE-as-seller, AgentCore is irrelevant — you target the x402 protocol directly and buyers (incl. AgentCore-using agents) will find you via the Bazaar. (source: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/payments.html)
- **x402 v2 spec mentions MCP and A2A transports** but the spec, examples, and Bazaar today are all HTTP-first. No public Coinbase recipe for "MCP server with x402" yet — sidebar links to it but the page 404s. The pragmatic path is HTTP. (source: https://raw.githubusercontent.com/coinbase/x402/main/specs/x402-specification-v2.md)
- **Bazaar discovery extension** (`@x402/extensions/bazaar`) is what makes routes searchable — declare input/output JSON schemas in route config; the Facilitator extracts them post-settle. Without this, your endpoint settles but doesn't surface in semantic search. (source: https://docs.cdp.coinbase.com/x402/bazaar)

## Existing players / prior art
- **Coinbase Bazaar** — already 10,000+ pay-per-use x402 endpoints indexed via CDP Facilitator. (source: AgentCore docs)
- **AgentCore Payments preview** — buyer-side managed wallet + budget guardrails; surfaces Bazaar via AgentCore Gateway MCP target. AWS-blessed buyer infra.
- **`@x402/express` / `@x402/next` / `@x402/hono`** — official seller middleware. Python (FastAPI/Flask) + Go SDKs equivalent.
- **No "browser-perception-as-paid-API" listing exists yet** in the visible Bazaar surface — confirms the brief's "first-mover" thesis.

## Concrete next steps for Dirk
1. **Pick one tool: `detect_elements`.** Stateless given a URL + query, easy to price per call, no browser session affinity needed beyond cold-start. Punt on `get_scene` (stateful, expensive cold-start, hard to price).
2. **Build a thin Express gateway in a new package** (`apps/uipe-x402-gateway` or a sibling repo). Single route `POST /v1/detect_elements`. Wire `@x402/express` + `@x402/evm` + `@x402/core`, facilitator = `x402.org/facilitator`, network = `eip155:84532` (Base Sepolia), price `$0.001`. Use a CDP Wallet for `payTo`. Call your existing UIPE-MCP under the hood (spawn or remote).
3. **Verify locally**: hit endpoint without payment → expect 402; pay with the buyer-side fetch SDK → expect 200 + result. This is your "presence" proof for the day.
4. **Decide before mainnet**: is paid-call UIPE actually a business, or just a distribution flag-plant? If only distribution, leave it on testnet, write the README that says "x402 mainnet listing coming Q3" and link the testnet endpoint. Mainnet requires real hosted UIPE (browser pool, queue, bill-when-cold-start), which is its own week.
5. **Add bazaarResourceServerExtension + declareDiscoveryExtension on the route** so when you do flip mainnet, Bazaar semantic search picks you up automatically.
6. **Don't list `get_scene` until you've solved hosted UIPE infra.** Pricing $0.001/call against a 2-3s Playwright cold-start is a money-losing prop.

## Open questions
- Does CDP have a *testnet* Bazaar where Base Sepolia listings surface? If yes, presence-without-mainnet is real. If no, "ship presence" requires mainnet + a real wallet today.
- What's the lift to host UIPE with a warm browser pool and per-session affinity? That's the actual product question — the x402 wrapper is decoration around it.
- Is there a way to register UIPE as an MCP server *behind* the Bazaar's MCP gateway (`/v2/x402/discovery/mcp`) so AgentCore Gateway buyers see it as a native MCP target rather than HTTP? The sidebar promises this; the docs page 404s.
