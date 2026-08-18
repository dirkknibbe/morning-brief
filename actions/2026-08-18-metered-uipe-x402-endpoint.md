---
date: 2026-08-18
classification: build-plan
action: Read AgentBridge's x402 integration and sketch a one-page spec for a metered UIPE endpoint using the same settlement flow.
source_brief: briefs/2026-08-18.md
---

## TL;DR
**Don't write this spec — it already exists, twice.** AgentBridge's repo is thin marketing ("detailed specs coming soon"); it uses stock x402 with nothing proprietary to reverse-engineer. The x402↔UIPE settlement flow was fully mapped on 2026-07-20 (`x402-uipe-billing-rail`) and nailed to the byte on 2026-07-25 (`x402vps-eip3009-uipe-handshake`, EIP-3009 schema 1:1). Sketching a *sixth* spec is motion, not progress. The blocker was never the payment rail — it's that UIPE is a **stdio-only MCP server** with no HTTP entrypoint (established 2026-07-15), and the testnet spike those dossiers scoped has been deferred for a month. Recommendation: **close this as "spec complete," and either do the one-afternoon Base Sepolia spike or kill the idea — no more dossiers.**

## Key findings
- AgentBridge = "ODDCS-Protocol," a build-in-public pay-per-fetch CN-web experiment, USDC on Base, node `api.060504.shop`. README literally says specs are "coming soon" — **zero settlement code to read** (source: https://raw.githubusercontent.com/tianzizhiming-svg/agentbridge/main/README.md).
- The rail is unchanged from prior dossiers: `402` + `accepts` → client signs EIP-3009 `transferWithAuthorization` → `X-PAYMENT` header retry → facilitator `/verify`+`/settle` → `200` + `X-PAYMENT-RESPONSE` (source: https://github.com/coinbase/x402).
- **One genuinely new detail since July:** the repo moved to the **x402-foundation** org; `coinbase/x402` is now a dev fork. Current API is `x402ResourceServer(facilitatorClient).register("eip155:84532", new ExactEvmScheme())` with `paymentMiddleware({ "GET /observe": { accepts:[{scheme:"exact", price:"$0.001", network:"eip155:84532", payTo}] }})`. Pin `@x402/core @x402/evm @x402/express` from the foundation org (source: coinbase/x402 examples/typescript/servers/express).
- Recurring unresolved gap across 07-15/07-20/07-25: UIPE speaks MCP JSON-RPC over stdio; x402 is an HTTP-header retry dance. The missing piece is a thin **HTTP shim in front of UIPE**, not any crypto.

## Existing players / prior art
- `actions/2026-07-25-x402vps-eip3009-uipe-handshake.md` — proof schema mapped 1:1; **most complete spec, use this one.**
- `actions/2026-07-20-x402-uipe-billing-rail.md` — seller-vs-buyer framing + testnet spike plan.
- `actions/2026-07-15-uipe-mcp-stateless-deadline.md` — establishes UIPE is stdio-only (the real blocker).
- AgentBridge / ODDCS — the brief's trigger, adds nothing new — https://github.com/tianzizhiming-svg/agentbridge

## Concrete next steps for Dirk
1. **Mark this action "spec complete — see 2026-07-25 dossier."** Stop re-specifying a solved design; the daily brief keeps resurfacing x402+UIPE and generating duplicate research.
2. **If you want progress, do the spike, not another doc.** One afternoon: `@x402/express` route `GET /observe` on Base Sepolia, `$0.001` test USDC, hosted facilitator, `curl` with a signed `X-PAYMENT`, confirm a real tx hash. **No UIPE code yet** — prove the round-trip.
3. **Then, and only then, build the HTTP shim** that lets UIPE's perception call run statelessly behind that route. That shim — not payments — is the actual unbuilt thing.
4. **Or kill it:** if UIPE's callers aren't agents holding funded Base wallets, per-observation crypto billing has no buyer. Decide that gate before spending the afternoon.

## Open questions
- Why has the testnet spike been deferred for a month across 3+ dossiers — missing wallet, no HTTP shim, or no real agent demand? That answer, not another spec, unblocks this.
- Does one UIPE observation clear compute cost at $0.001, or does it lose money per call?
- Mainnet `payTo` means real USDC custody/withdrawal — who holds the key, and does it drag in KYC/tax you don't want for a spike?
