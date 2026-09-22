---
date: 2026-09-22
classification: build-plan
action: Draft a 1-page spec for an agent-identity handshake header (agent ID, principal, scope, signature) in the UIPE/MCPAASTA gateway and post it as an RFC.
source_brief: briefs/2026-09-22.md
---

## TL;DR
Do **not** invent a new signature format, and do **not** file an IETF RFC — that lane is already taken. Cloudflare's **Web Bot Auth** (IETF `draft-meunier-webbotauth-httpsig-protocol`, June 2026) already standardizes "which agent is this + cryptographic proof" via RFC 9421 HTTP Message Signatures, an Ed25519 key directory, and a `Signature-Agent` header. It ships in production behind Cloudflare today. The real, unfilled gap is **delegation**: *who is this agent acting for (principal) and what is it allowed to do (scope)*. Web Bot Auth has no principal concept; MCP's OAuth-based auth punts delegation to the token layer with no per-request wire binding. So the fundable move is a thin **delegation envelope** layered on top of Web Bot Auth and enforced at the MCPAASTA gateway — not a competing wire spec. Ship it as a gateway feature spec + a Web Bot Auth *profile*, published as a GitHub discussion, not an IETF I-D.

## Key findings
- Web Bot Auth = agent-ID + signature, already standardized and shipping. Ed25519 key → JWK thumbprint → key directory → `Signature-Agent` header signed per RFC 9421. (source: https://developers.cloudflare.com/bots/concepts/bot/verified-bots/web-bot-auth/)
- The IETF draft is active and consolidating: architecture draft was replaced by `draft-meunier-webbotauth-httpsig-protocol` (June 2026), which defines `Signature-Agent`, multi-signature, and anti-replay. Filing your own RFC here duplicates it. (source: https://datatracker.ietf.org/doc/draft-meunier-web-bot-auth-architecture/)
- Web Bot Auth answers "is this a legit bot," **not** "on whose behalf / with what rights." No principal, no scope, no consent. That's the whole opportunity.
- MCP authorization is OAuth 2.1: RFC 9728 (Protected Resource Metadata) + RFC 8707 (Resource Indicators). Delegation ("acting for user Y") is left to the token and never bound to a signed per-request header. (source: https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
- Delegation prior art exists but is unglued: **RFC 8693 OAuth Token Exchange** already models `actor` / `may_act` for "A acting on behalf of B." Nobody ties that to a per-request signature at a gateway. Your gateway is where those two worlds meet.

## Existing players / prior art
- **Web Bot Auth (Cloudflare + IETF)** — signed HTTP header proving bot identity; the signature layer you build on — https://developers.cloudflare.com/bots/concepts/bot/verified-bots/web-bot-auth/
- **MCP Authorization (Anthropic)** — OAuth 2.1 transport authz; the delegation layer you extend — https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization
- **RFC 8693 Token Exchange** — `actor`/`may_act` delegation semantics to reuse, not reinvent
- **Amazon *Buy for Me* / opt-out** — the market forcing function (self-identifying agents), per today's brief

## Concrete next steps for Dirk
1. Reframe the deliverable: **"UIPE/MCPAASTA Agent Delegation Profile"** — a *profile over* Web Bot Auth, not a new header spec. One page, two headers max.
2. Define the delegation envelope: reuse `Signature-Agent` for agent ID + signature; add one signed claim carrying `principal` (user DID/sub), `scope` (allowed tools/actions), and `consent_ref`. Bind it into the RFC 9421 signature base so it can't be stripped.
3. Specify the gateway enforcement rule: MCPAASTA validates the Web Bot Auth signature, resolves the key directory, then allow/denies per `scope` + policy. This is the product; the header is just the interop hook.
4. Publish as a GitHub Discussion / gist titled as a Web Bot Auth extension — **not** an IETF I-D. Link it from the MCPAASTA repo. (You said "post as RFC"; do it as a design RFC doc, not a standards-body filing.)

## Open questions
- Should scope be a fixed enum (tools) or a policy expression (Casbin-style, per your 2026-09-21 dossier)? The gateway already leans Casbin — reuse it.
- Does UIPE's "this agent is X acting for Y" UI signal become the *consent capture* that mints `consent_ref`, closing the loop from perception → attestation?
