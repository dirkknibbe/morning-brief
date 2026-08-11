---
date: 2026-08-11
classification: build-plan
action: Add an OAuth Authorization Server layer to UIPE's MCP server using the FusionAuth on-behalf-of flow as the template.
source_brief: briefs/2026-08-11.md
---

## TL;DR
Don't build an Authorization Server. The MCP spec (2025-06-18) makes UIPE's MCP server an OAuth 2.1 **Resource Server** that *delegates* to an AS — the AS "layer" is a dependency you configure, not code you write. The FusionAuth on-behalf-of flow is just the standard Authorization Code grant: user consents, MCP client gets an audience-bound token, UIPE validates it. First PR = turn UIPE into a Resource Server (serve `/.well-known/oauth-protected-resource`, validate bearer JWTs, enforce per-tool scopes) pointed at a delegated AS. Pick the AS on cost: FusionAuth Community is free to self-host but **custom OAuth scopes require a paid license**, which per-tool gating needs — so evaluate WorkOS/Stytch MCP tiers before committing.

## Key findings
- MCP server MUST act as an OAuth 2.1 Resource Server and implement RFC 9728 Protected Resource Metadata; the AS MUST implement RFC 8414 AS Metadata and SHOULD support RFC 7591 Dynamic Client Registration. Tokens are audience-bound. (source: https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
- "On-behalf-of" = plain Authorization Code grant with user consent/scopes; client self-registers just-in-time via CIMD (newer, "the future") or DCR (backwards-compat). RFC 9728 handles the 401→discovery redirect. (source: https://fusionauth.io/blog/mcp-authorization-server)
- FusionAuth's own example gates tools with **custom scopes**, which need an Essentials/Enterprise license (paid). Each MCP client is a separate FusionAuth application; use `/api/jwt/validate` (not introspection — it 401s cross-app). (source: https://fusionauth.io/docs/extend/examples/controlling-access-mcp-server)
- **Never forward the received token downstream** — MCP "token passthrough" is prohibited by the security best-practices doc. Exchange for a new token if UIPE calls downstream services. (source: FusionAuth example doc, above)
- TS MCP SDK (UIPE's stack) ships auth helpers: `requireBearerAuth`, `mcpAuthRouter`, and a `ProxyOAuthServerProvider` to front an external AS — so the RS work is wiring, not from-scratch OAuth. (source: https://github.com/modelcontextprotocol/typescript-sdk)

## Existing players / prior art
- FusionAuth — self-host AS, Community free; custom scopes paid — https://fusionauth.io/blog/mcp-authorization-server
- WorkOS AuthKit — MCP-native auth, generous free MAU tier — worth pricing vs FusionAuth
- Stytch / Scalekit — both ship MCP-specific OAuth (DCR, resource metadata) with free tiers
- MCP TS SDK auth module — reference RS implementation (`ProxyOAuthServerProvider`)

## Concrete next steps for Dirk
1. **Decide RS-only vs AS-hosting.** Recommendation: UIPE = Resource Server, delegate the AS. Rolling your own OAuth 2.1 AS is the wrong lesson to take from the FusionAuth post.
2. **Cost-gate the AS choice** *before* coding: if per-tool scope gating is core to the $50/mo tiering, FusionAuth Community won't do it free — price WorkOS/Stytch first.
3. **First PR (RS layer):** serve `/.well-known/oauth-protected-resource` (RFC 9728) with `authorization_servers`; add `requireBearerAuth` middleware validating audience/issuer/exp/scope via the AS JWKS or validate endpoint; return `401 WWW-Authenticate` on unauth.
4. **Second PR:** map scopes → tools; add a "get user context" path from token claims; add token-exchange stub (no passthrough) for any downstream calls.
5. Test with Claude Desktop as the DCR/CIMD client end-to-end before touching billing.

## Open questions
- UIPE's current MCP transport — Streamable HTTP vs stdio? Remote auth only makes sense over HTTP; confirm before scoping.
- Is per-tool scope gating actually needed for the $50 tier, or is coarse "any valid token" enough for v1 (which every free AS supports)?
- CIMD vs DCR: does UIPE's target client (Claude Desktop) support CIMD yet, or is DCR still required?
