---
date: 2026-07-25
classification: research
action: Read x402vps's `/api/create` → 402 → EIP-3009 retry flow and note whether UIPE could accept the same challenge/proof handshake as its MCPAASTA billing layer.
source_brief: briefs/2026-07-25.md
---

## TL;DR
x402vps is a live proof point: sell a resource, answer with `402 + payment challenge`, let the agent sign a **gasless EIP-3009 `transferWithAuthorization`** and retry with the signature, then a facilitator settles USDC on Base. The whole "proof" the client returns is just a JSON object — `{signature, authorization{from,to,value,validAfter,validBefore,nonce}}` — reconstructable and verifiable statelessly. **Yes, UIPE can accept the identical handshake**, because the challenge and proof are transport-agnostic JSON, and UIPE already traffics in signed envelopes. The one real gap is the same one the 2026-07-20 dossier flagged: x402 is HTTP-header-retry, UIPE tools are JSON-RPC — you need a thin bridge, not new crypto. Don't hand-roll; wrap the paid capability in `@x402/express` (exact-evm, eip3009 default) and let UIPE carry the PaymentPayload as an attached proof-of-payment.

## Key findings
- **x402vps flow (4 steps, mainnet):** `POST /api/create {plan,leaseHours}` → server returns `402` + USDC challenge → agent signs EIP-3009 transfer → retries with proof → container provisioned. Free endpoints (`/api/exec`, `/api/status`, `/api/destroy`) take no payment; only create/extend are paid. (source: https://x402vps.com)
- **The proof is 6 fields + a 65-byte sig.** exact-evm `eip3009` payload: `payload.signature` + `payload.authorization{from,to,value,validAfter,validBefore,nonce}`, signed via EIP-712 against the token's `transferWithAuthorization`. Facilitator pays gas and can only broadcast — it cannot alter amount or destination. (source: raw.githubusercontent.com/x402-foundation/x402/main/specs/schemes/exact/scheme_exact_evm.md)
- **EIP-3009 uses random 32-byte nonces (not sequential),** so an agent can hold many in-flight authorizations without ordering failures — ideal for concurrent per-call billing. One-time use. (source: https://eips.ethereum.org/EIPS/eip-3009)
- **The handshake is JSON end to end:** server emits `PaymentRequirements` (scheme, network, payTo, maxAmountRequired), client echoes a `PaymentPayload` with matching (scheme, network). Nothing HTTP-specific about the *contents* — only the retry envelope is HTTP. (source: raw.githubusercontent.com/coinbase/x402/main/README.md)
- **Stateless verification is possible locally:** because the authorization is fully reconstructable, UIPE could *verify* payment intent without a facilitator; only *settlement* (broadcast + confirm) needs one. That's a cleaner fit for UIPE's proof-envelope model than the prior dossier assumed.

## Existing players / prior art
- **x402vps** — "containers for agents, pay per hour," EIP-3009/USDC/Base, no signup — the exact seller pattern MCPAASTA would copy — https://x402vps.com
- **Coinbase x402 + exact-evm scheme** — reference SDK + the eip3009 payload spec UIPE must accept — https://github.com/x402-foundation/x402
- **Prior UIPE-x402 dossiers** — actions/2026-07-20-x402-uipe-billing-rail.md (seller-vs-buyer decision), actions/2026-05-08-uipe-x402-bazaar-listing.md (discovery)

## Concrete next steps for Dirk
1. **Map the schema 1:1.** Write the UIPE proof-of-payment type as exactly `{signature, authorization{from,to,value,validAfter,validBefore,nonce}}` — no invention. If it doesn't match byte-for-byte, agents can't reuse their x402 wallet stack.
2. **Testnet spike (Base Sepolia):** stand up one `@x402/express` route priced in test USDC, sign+retry with a funded embedded wallet, confirm the 402 round-trip and a real tx hash. Still no UIPE code.
3. **Bridge to MCP:** make the UIPE tool a thin client of that HTTP route (hold payer wallet server-side) OR return a 402-equivalent structured error the agent retries — prototype both, measure friction.

## Open questions
- Does UIPE want to *verify* payment (local, stateless) or *settle* it (needs a facilitator + gas)? Different trust and infra footprints.
- Sub-cent calls: is Base settlement cost dominated by a $0.01/hr charge, and does x402vps eat facilitator fees or pass them through?
- Non-Coinbase facilitator to avoid single-vendor lock-in on the settlement path (still unanswered from 07-20).
