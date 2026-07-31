---
date: 2026-07-31
classification: research
action: Skim draft-klrc-aiagent-auth and note where MCPAASTA's micropayment + authz model aligns or conflicts with the emerging IETF agent-auth standard.
source_brief: briefs/2026-07-31.md
---

## TL;DR
The draft (`draft-klrc-aiagent-auth-03`, Kasselman et al. — Okta/OpenAI/AWS/Ping/Zscaler, Informational, expires Jan 2027) is **pure identity + authorization**: WIMSE/SPIFFE workload identity + OAuth 2.0 delegation. It has **no payment/metering layer at all** — so MCPAASTA's x402 micropayment rail is *orthogonal*, not in conflict. Good news for de-risking: the standard doesn't compete with your billing. The real gap: the draft answers "*who authorized this agent, on whose behalf*" (OAuth `sub`/`client_id`/`aud` + WIMSE ID), while x402 only answers "*who pays*" (a wallet `from` address). Those are different questions. Your roadmap line "MCP authz/metering shim **implementing the IETF draft**" is half-wrong — the draft covers authz, not metering; don't market billing as IETF-conformant. Fix: run UIPE's MCP endpoint as an OAuth 2.0 Resource Server *and* keep x402 as a separate payment proof — two headers, not one.

## Key findings
- Draft explicitly scopes payment OUT — Tools/Services/Resources are just "endpoints an agent invokes"; no metering/billing anywhere in 14 sections (source: https://www.ietf.org/archive/id/draft-klrc-aiagent-auth-03.html)
- Authz model = OAuth 2.0 delegation: agent is the OAuth client (`client_id`), on-behalf-of user is `sub`, tokens are `aud`-scoped JWT or opaque+introspection; scopes derive from a natural-language "Agent Mission" planning step (source: §10.1–10.4, same URL)
- **Static API keys are named an antipattern** — "bearer artifacts, not cryptographically bound." This *aligns* with MCPAASTA: both x402 (signed payment payload) and UIPE receipts (Ed25519) are stateless signed artifacts, no long-lived keys (source: §8, same URL)
- x402/EIP-3009 handshake authenticates a **wallet, not a delegated identity** — `{signature, authorization{from,to,value,...}}` proves payment, carries zero user/agent delegation context (source: actions/2026-07-25-x402vps-eip3009-uipe-handshake.md)
- UIPE signed perception receipts (Ed25519 + SHA-256 chain) map cleanly onto the draft's audit-trail / observability goals (§11) — but only if the receipt also carries the caller's OAuth `sub`, which it doesn't today (source: actions/2026-07-27-uipe-signed-perception-receipts.md)

## Existing players / prior art
- IETF draft-klrc-aiagent-auth — agent auth framework built on WIMSE/SPIFFE + OAuth — https://github.com/PieterKas/agent2agent-auth-framework
- MCP spec's own OAuth 2.1 resource-server model for remote servers — the draft defers to exactly this; MCPAASTA already *should* be an OAuth RS
- x402 / Coinbase facilitator + EIP-3009 — the payment layer the draft leaves empty (your rail)

## Concrete next steps for Dirk
1. **Reframe the roadmap item.** Split "authz/metering shim" in two: an *authz* half that implements the draft (validate inbound `client_id`/`sub`/`aud`/`scope`, introspect opaque tokens) and an *x402* half that stays proprietary. Stop saying metering "implements the IETF draft."
2. **Make the UIPE MCP endpoint an OAuth 2.0 Resource Server.** Require `Authorization: Bearer <token>`, validate `aud`/`scope`, extract `sub` and stamp it *into the signed perception receipt* — now the receipt attests *who* the verdict was rendered for. That fuses the draft's delegation with your audit-trail-as-product angle.
3. **Carry payment + authz as parallel proofs** in the handshake: x402 `PAYMENT-SIGNATURE` (who pays) alongside the OAuth access token (who authorized). Prototype gating: reject if either is missing.
4. **Watch, don't chase.** It's Informational + pre-WG (low near-term risk), but the author roster converges toward a real standard. Track the repo; watch "Client Capability Discovery" (§10.10.3) as the likely place to advertise x402 payment requirements via OAuth metadata.

## Open questions
- Can x402's 402 challenge be surfaced through the draft's OAuth Client/Resource Capability Discovery, unifying payment + authz into one discovery step?
- MCP already adopted OAuth 2.1 for remote servers — does this draft's WIMSE/SPIFFE layer sit *above* MCP's OAuth (workload identity → then OAuth delegation), and does MCPAASTA need both or just the OAuth half?
