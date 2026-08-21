---
date: 2026-08-21
classification: build-plan
action: Read Argentic's invoice→token curl flow, then sketch the same 402 handshake in front of one UIPE MCP method to decide if x402/L402 gating is a weekend build.
source_brief: briefs/2026-08-21.md
---

## TL;DR
Yes — gating one UIPE MCP method behind a 402 handshake is a weekend build, and probably less than a weekend. The handshake itself is ~90 lines (two calls + one signature), and you don't have to bolt HTTP-402 onto MCP by hand: x402 already ships a **native MCP transport** where a tool returns `isError: true` + a `PaymentRequired` payload, and the client retries the same call with payment at `_meta["x402/payment"]`. The real work isn't the handshake — it's the rail decision (x402/USDC-on-Base vs L402/Lightning) and the wallet+facilitator plumbing. Do the one-hour sketch against the Coinbase CDP MCP example, not by reimplementing curl steps.

## Key findings
- **The "4 curl steps" are the standard x402 handshake, not vendor-specific.** GET/POST with no payment → `402` + structured `accepts[]` challenge → sign EIP-712 `TransferWithAuthorization` over USDC → replay with `X-PAYMENT` header → `200` + `X-PAYMENT-RESPONSE` (tx hash). Agent signs a permission slip; the facilitator moves the USDC, so the agent wallet needs USDC but **no ETH for gas**. (source: https://hermesplant.com/blog/x402-from-curl)
- **MCP has a first-class x402 mapping — you do NOT return raw HTTP 402 from a tool.** Tool result `isError: true` + `PaymentRequired` = the 402; retry carries payment in `_meta["x402/payment"]`; settlement echoes at `_meta["x402/payment-response"]`. This is the crux: MCP tools are JSON-RPC, not HTTP endpoints, and x402 already solved the impedance mismatch. (source: https://docs.cdp.coinbase.com/x402/buyer/mcp-payments)
- **L402 (Lightning) is the alternative rail:** credentials are `<macaroon>:<preimage>`, challenge via `WWW-Authenticate: L402`, pay invoice to reveal preimage, reuse token until revoked (expiry / N-usages / tier). More agent-native reuse semantics, but needs a Lightning node/Aperture proxy. (source: https://docs.lightning.engineering/the-lightning-network/l402/protocol-specification)
- **"Argentic" ≈ generic x402 seller** (closest real match: Agnic, docs.agnic.ai). The flow you'd read there is the same standard handshake — no need to chase the exact site.

## Existing players / prior art
- Coinbase CDP Bazaar MCP — `proxy_tool_call` returns payment-required result; CDP-managed wallet, no private keys — https://docs.cdp.coinbase.com/x402/buyer/mcp-payments
- Official x402 MCP-server guide — https://docs.x402.org/guides/mcp-server-with-x402
- `merkleworks/x402-mcp` — MCP server exposing `x402_http_request` that auto-handles 402 → pay → retry
- `mcp-billing-gateway` + dev.to tutorial "Build a Paid MCP Server with x402" — billing infra for per-call USDC
- `xmcp.dev`, `eco.com`, `true402/mcp-server` — per-tool-call x402 middleware

## Concrete next steps for Dirk
1. **One-hour sketch:** clone the Coinbase CDP MCP payments example, point a wrapped MCP client at their Bazaar `proxy_tool_call`, watch the `isError`→`_meta["x402/payment"]`→settle loop fire once on testnet. That's your reference handshake — don't rebuild curl steps.
2. **Pick the rail before writing UIPE code:** x402/USDC-on-Base (bigger ecosystem, EIP-712, needs a facilitator) vs L402/Lightning (better token-reuse, needs a node). For a weekend prototype, x402 + Coinbase facilitator is lower-friction.
3. **Gate exactly one method** (a read-only, deterministic UIPE method) by wrapping its handler: return `PaymentRequired` when `_meta["x402/payment"]` is absent, verify+settle when present, else run the real logic.

## Open questions
- Do UIPE's actual buyers hold a funded Base/USDC (or Lightning) wallet? If not, metered gating is a demo, not a distribution channel — the rail choice is a go-to-market question, not a code question.
- Does per-call metering fit UIPE's value shape, or would a reusable L402 tier (pay once, N calls) match usage better and cut settlement overhead?
