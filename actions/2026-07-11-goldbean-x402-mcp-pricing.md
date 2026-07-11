---
date: 2026-07-11
classification: research
action: Study GoldBean's live x402-metered MCP marketplace — how it prices, packages, and gates calls — as the reference implementation for UIPE's eventual paywall.
source_brief: briefs/2026-07-11.md
---

## TL;DR
GoldBean is a solo-dev (`wuzenghai616-lang`) x402 gateway wrapping ~47 API routes (Baidu AI OCR/TTS/ASR/LLM + crypto/weather/search) behind USDC-on-Base micropayments. The reusable pattern for UIPE is its **three-layer gate**: (1) a machine-readable `.well-known/x402-bazaar` manifest advertising price/currency/wallet, (2) a free quota keyed to a registered `x-user-id` (no wallet), and (3) x402 pay-per-call (`402 → sign USDC → on-chain verify → 200`) for everything above quota. Copy the *mechanism* — the bazaar manifest + dual free-quota/pay-per-call gate is exactly what a UIPE paywall needs. Do **not** copy the *pricing*: it's internally inconsistent and clearly unstuck. Running `npx goldbean-mcp` is optional; the manifest + repo README gave the full picture without it.

## Key findings
- **Two pricing surfaces that disagree.** The MCP README sells monthly *tiers* (Free 50/day · Pro $10/500mo · Max $25/2000mo); the live bazaar manifest sells *per-call* ($0.01–0.03/req) + bulk packs ($0.99/100 valid 30d, $4.99/500 valid 90d). Endpoint counts drift too (120+ vs 49 vs 47; free credits 20 vs 50). Signal: the MCP layer is a thin wrapper and the pricing is a moving target, not a validated model. (source: npm README + https://goldbean-api.xyz/.well-known/x402-bazaar)
- **Discovery via a standard well-known manifest.** `GET /.well-known/x402-bazaar` returns JSON: `pricing`, `currencies` (USDC/base/decimals:6/contract), `payment_methods:[x402,paypal,alipay]`, `wallet`, `network:eip155:8453`. This is the paywall's public contract — agents read it to learn what a call costs before paying. (source: https://goldbean-api.xyz/.well-known/x402-bazaar)
- **Gate = free quota OR pay-per-call, no API keys/KYC.** Free path: `POST /paid/user/register {userId}` → `{freeCredits, apiKey:"GB_XXXXXX"}`, then send `x-user-id: GB_XXXXXX`. Paid path: x402 — `402 Payment Required → wallet signs USDC tx on Base → server verifies on-chain → serves`. (source: https://github.com/wuzenghai616-lang/goldbean README)
- **Per-endpoint price tags live on the route.** e.g. `/paid/baidu-ocr` $0.01, `/paid/baidu-ocr-accurate` $0.02 — pricing is per-route metadata, not a flat rate, so metering is endpoint-granular. (source: repo README route table)
- **Fiat fallback exists.** PayPal/Alipay prepaid-credit endpoints (`/paid/paypal/create-order`, `/capture`) sit alongside x402 — crypto is the headline, not the only rail. (source: repo README)

## Existing players / prior art
- **GoldBean** — x402 USDC gateway over Baidu AI + misc APIs; the subject. — https://github.com/wuzenghai616-lang/goldbean
- **awesome-x402** (xpaysh) — curated list of x402 servers/tooling; where to find other reference impls. — https://github.com/xpaysh/awesome-x402
- **x402.org** — the protocol spec itself (HTTP 402 + payment payload). — https://x402.org
- **MCPize / Glama.ai** — MCP monetization/registry platforms GoldBean lists on; distribution channel prior art. — https://mcpize.com/mcp/goldbean

## Concrete next steps for Dirk
1. **Steal the manifest, not the numbers.** Draft UIPE's own `.well-known/x402-bazaar`-style descriptor (price, currency, wallet, per-route metadata) as the paywall's public contract — that's the highest-leverage copy.
2. **Adopt the dual gate.** Free quota via registered user-id header + x402 pay-per-call above quota. Keep fiat (Stripe/PayPal) as the fallback rail exactly as GoldBean does — most UIPE users won't hold USDC.
3. **Skip the live `npx` poke unless you want to watch a real 402 handshake.** If curious, `curl -i https://goldbean-api.xyz/paid/baidu-ocr` should return a live 402 with the payment challenge header — that's the one thing worth seeing firsthand for UIPE's own 402 responder.
4. **Do your own price discovery.** GoldBean's inconsistency is a warning: settle UIPE pricing from your own cost/value model, not by mirroring a churning reference.

## Open questions
- Does the x402 challenge return a `402` with a standard payment-requirements header (facilitator URL, amount, asset), or a custom shape? (needs a live `curl -i`, not fetched here)
- Is settlement synchronous on-chain per call (latency cost) or does it batch/escrow? README implies per-call on-chain verify — worth confirming before UIPE commits to the same latency profile.
