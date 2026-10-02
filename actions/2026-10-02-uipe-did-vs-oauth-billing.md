---
date: 2026-10-02
classification: research
action: Decide whether UIPE/MCPAASTA billing should ride a DID credential if agent identity standardizes around DIDs.
source_brief: briefs/2026-10-02.md
---

## TL;DR
Agent identity is **not** standardizing around W3C DIDs — the brief's premise is wrong about both sources it cites. OpenID's *Identity Management for Agentic AI* paper builds its entire trust chain on **OAuth 2.1 / OIDC token exchange** (no DIDs, no VCs). Aweb roots identity in **DNS + signed certificates (AWID)**, also not DIDs. DIDs/VCs are a *third, less-adopted camp* (the SSI/decentralized-identity community), not the convergence point. **Decision: do not issue or require a DID for MCPAASTA billing.** Ride OAuth 2.1 (which MCP already mandates) and keep payment as a separate, credential-agnostic authorization token. Stay DID-tolerant, not DID-dependent.

## Key findings
- OpenID paper's trust chain is OAuth all the way down: OBO via **OAuth 2.0 Token Exchange / Identity Assertion grants**, attenuated delegation via **Biscuits/Macaroons** (`Scope_{n+1} ⊆ Scope_n`), revocation via **SCIM + Shared Signals Framework** — not StatusList, not DIDs. (source: https://www.alphaxiv.org/abs/2510.25819)
- MCP itself already "evolved to integrate OAuth 2.1 for authentication and authorization." A UIPE MCP server is, by spec, an OAuth resource server — DIDs are off the standard path. (source: https://www.alphaxiv.org/abs/2510.25819)
- Aweb's identity is **AWID = `domain/name`, trust begins in DNS**: namespace controller → team controller → agent signing key. No DID anywhere in its `llms.txt`. The brief's "DNS-rooted DID identities" description is a conflation. (source: https://aweb.ai/llms.txt)
- The real gap both the paper and aweb flag is **cross-trust-domain delegation + scope attenuation**, not "which identifier format." That's where MCPAASTA value actually sits — metering + attenuated authorization per call, independent of credential type.

## Existing players / prior art
- OpenID Foundation — OAuth/OIDC extensions for agents (Authority Claims, token exchange) — https://openid.net/wp-content/uploads/2025/10/Identity-Management-for-Agentic-AI.pdf
- Aweb / AWID — DNS-rooted agent identity + federation — https://awid.ai
- South et al., *Authenticated Delegation and Authorized AI Agents* — the paper's central cite for OBO-over-impersonation — https://arxiv.org/abs/2501.09674
- IETF `draft-oauth-ai-agents-on-behalf-of-user` — concrete OBO flow — https://datatracker.ietf.org/doc/draft-oauth-ai-agents-on-behalf-of-user/

## Concrete next steps for Dirk
1. **Kill the DID requirement.** Design MCPAASTA billing to attach to an **OAuth 2.1-authenticated MCP call** — the client presents an OBO/attenuated token, you meter per call. This is the standard path and costs you nothing to adopt.
2. **Model the billing identifier as an abstraction** over `{OAuth sub, AWID, DID}`. Verify a DID-backed VC *if* a client presents one, but never require it. One interface, three possible backing credentials — you don't bet on a winner.
3. **Put the differentiation in attenuation + metering**, not identity: per-tool-call scope limits (Biscuit/Macaroon-style) + usage receipts. That's the "pay per perception call" wrapper, and it's credential-agnostic.
4. **Correct the brief's framing** before building on it — the "DIDs are converging" thesis would have sent you down a bolted-on-DID detour the standards don't support.

## Open questions
- Does the emerging **A2P / agent-payment** work bind payment to OAuth tokens or to a separate credential? (Worth a 20-min read before committing the payment-token design.)
- Is anyone shipping a production OAuth↔DID shim for MCP yet, or is that still greenfield (and thus the actual "unsolved friction" from the brief's spark #3)?
