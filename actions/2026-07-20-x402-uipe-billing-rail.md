---
date: 2026-07-20
classification: research
action: Trace one x402 paid call end to end and note what a UIPE MCP tool would need to accept x402 as its billing rail.
source_brief: briefs/2026-07-20.md
---

## TL;DR
x402 is HTTP 402 revived: a client hits a protected endpoint, gets `402 + PAYMENT-REQUIRED`, signs a stablecoin authorization (USDC on Base/Polygon/Solana), and resubmits with a `PAYMENT-SIGNATURE` header; a *facilitator* verifies and settles onchain, then the server returns `200 + PAYMENT-RESPONSE` (tx hash). The whole thing is stateless — no accounts, no API keys. For a UIPE MCP tool to bill via x402 you need three things a UIPE tool doesn't have today: a **receiving wallet on Base**, **payment middleware that emits the 402 + verifies via a facilitator**, and a **bridge between MCP's JSON-RPC and x402's HTTP-header dance**. My recommendation: it's viable but only worth building if UIPE's callers are *agents* (they must hold a funded crypto wallet). Prototype UIPE-as-seller behind one HTTP endpoint on Base **testnet** using the Coinbase facilitator — don't hand-roll the payment scheme.

## Key findings
- **End-to-end trace (10 steps):** request → `402 PAYMENT-REQUIRED` (scheme, network, amount, asset, payTo) → client signs payload with wallet → resubmit same request + `PAYMENT-SIGNATURE` → server verifies (locally or facilitator `/verify`) → facilitator validates scheme/network → server processes → settlement via facilitator `/settle` → facilitator broadcasts onchain + waits for confirmation → `200 OK` + resource + `PAYMENT-RESPONSE` header with settlement details. (source: https://docs.cdp.coinbase.com/x402/core-concepts/how-it-works)
- **Facilitator abstracts crypto away:** client/server never touch gas, rpc, or chains — the facilitator does. Trust-minimizing: it can't move funds outside client intent. (source: https://raw.githubusercontent.com/coinbase/x402/main/README.md)
- **One line of code to sell:** `paymentMiddleware({ "GET /x": { accepts: [...], description } })` on Express/Hono/Next/Fastify. Real traction: 75M tx / $24M volume / 22K sellers in last 30 days. (source: https://www.x402.org/)
- **Agent-side is the hard part:** the *payer* needs a funded embedded wallet. Coinbase ships `npx @coinbase/payments-mcp` (Agentic Wallet MCP) that lets an agent auto-discover (Bazaar) and pay x402 services with USDC — no seed phrase, email/OTP login. (source: https://docs.cdp.coinbase.com/agentic-wallet/mcp/welcome)
- **MCP mismatch:** MCP tools are JSON-RPC, not HTTP GETs with retry-on-402. UIPE must either keep the paid capability behind an HTTP endpoint wrapped by `@x402/express` and make the MCP tool a thin client, or return a 402-equivalent structured error the calling agent retries with a signed payload.

## Existing players / prior art
- **Coinbase x402 + CDP facilitator** — reference SDKs (TS/Py/Go), hosted facilitator, Base/Polygon/Solana — https://github.com/coinbase/x402
- **Agentic Wallet MCP (`@coinbase/payments-mcp`)** — payer side; the pattern UIPE's *consumers* would use — https://docs.cdp.coinbase.com/agentic-wallet/mcp/welcome
- **x402 Bazaar** — discovery layer so agents find priced endpoints — docs.cdp.coinbase.com/x402 (Bazaar); see prior dossier actions/2026-05-08-uipe-x402-bazaar-listing.md

## Concrete next steps for Dirk
1. **Decide the direction first:** UIPE as *seller* (charge per tool call) vs *buyer* (pay downstream). "Billing rail" = seller. Only pursue if UIPE's real callers are agents with wallets, not humans.
2. **Testnet spike:** stand up one Express route wrapped in `@x402/express` on Base Sepolia, priced in test USDC, verify+settle through the Coinbase facilitator — confirm the header round-trip and a real tx hash. No UIPE code yet.
3. **Then bridge to MCP:** make a UIPE MCP tool a thin client of that HTTP endpoint (hold UIPE's payer wallet server-side) OR expose the 402 upstream and require the agent to pay. Prototype both, measure friction.

## Open questions
- Does x402 support a scheme where UIPE holds funds in escrow / streams per-token, or only discrete per-call `exact` payments?
- Who eats gas/facilitator fees on sub-cent tool calls — is Base cheap enough that a $0.001 UIPE call isn't dominated by settlement cost?
- Is there a non-Coinbase facilitator to avoid single-vendor lock-in on the settlement path?
