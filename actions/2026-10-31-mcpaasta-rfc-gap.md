---
date: 2026-10-31
classification: research
action: Map Appwrite's remote-MCP RFC checklist (9728/8414/8707/7591) against the UIPE MCP server; the gap list is the MCPAASTA spec.
source_brief: briefs/2026-10-31.md
---

## TL;DR
UIPE's MCP server (`packages/core/src/mcp/index.ts:15`) is **stdio-only** — it has a browser-perception toolset and good input-safety plumbing, but **zero** remote-transport or auth surface. Against the 7-piece remote-MCP checklist it scores **0/7**. That's not a bug in UIPE; it's the whole point: the entire auth stack is the seam, and the seam is a *separate* product, not a UIPE feature. Don't bolt OAuth into UIPE core. Build MCPAASTA as a standalone gateway that fronts any stdio MCP server (UIPE being the first consumer) and speaks the remote-auth spec on its behalf — exactly Opportunity Spark #1 ("Remote MCP in a box").

## Key findings
- UIPE transport is `StdioServerTransport` only — no HTTP/Streamable-HTTP anywhere in `packages/` (grep for `StreamableHTTP|express|fastify|hono|.listen(` → no non-test hits). (source: /Users/dirkknibbe/uipe/ui-perception-engine/packages/core/src/mcp/index.ts:15)
- The "auth-ish" hits in the repo are input-safety utils, not OAuth: `url-guard.ts`, `untrusted.ts` (wrapUntrusted), `sanitize-error.ts`. Useful for piece #7's *scope/arg* hygiene later, irrelevant to pieces #1–#6. (source: packages/core/src/mcp/server.ts:17-19)
- The 7 pieces (Appwrite teardown, per brief): (1) public Streamable-HTTP endpoint, (2) protected-resource metadata RFC 9728, (3) OAuth 2.1 AS w/ PKCE + discovery RFC 8414, (4) resource indicators RFC 8707, (5) dynamic client registration RFC 7591, (6) in-product consent screen, (7) per-call token/scope checks + revocation. (source: briefs/2026-10-31.md:5)
- These four numbers are **IETF RFCs**, not Appwrite docs — they're the exact stack the MCP authorization spec (2025-06-18 rev) mandates. So the "spec" already exists and is stable; MCPAASTA is an *implementation* bet, not a research bet. (source: MCP auth spec / RFC registry)
- Gap table (UIPE today):

  | # | Piece | UIPE | Seam? |
  |---|-------|------|-------|
  | 1 | Streamable-HTTP endpoint | ❌ stdio | yes |
  | 2 | PR metadata (9728) | ❌ | yes |
  | 3 | OAuth2.1 + PKCE + disc (8414) | ❌ | yes |
  | 4 | Resource indicators (8707) | ❌ | yes |
  | 5 | Dynamic client reg (7591) | ❌ | yes |
  | 6 | Consent screen | ❌ | yes |
  | 7 | Per-call token/scope + revoke | partial (arg hygiene only) | yes |

## Existing players / prior art
- Appwrite — ships hosting+data+auth so remote MCP is one-click; monetizes the platform, seam is the hook. — brief:17
- MCP TS SDK — already has an auth module (`mcpAuthRouter`, PRM/AS metadata helpers, DCR) that implements 9728/8414/7591 as Express middleware. **Don't hand-roll these.** — @modelcontextprotocol/sdk
- Stytch / WorkOS / Clerk — hosted OAuth2.1 + DCR + consent; a MCPAASTA MVP could wrap one of these rather than run its own AS.

## Concrete next steps for Dirk
1. **Don't touch UIPE core.** Keep it stdio. Treat it as consumer #1 of the gateway.
2. Spike a `mcpaasta-gateway` package: Express/Hono app that (a) proxies Streamable-HTTP → child stdio MCP process, (b) mounts the SDK's `mcpAuthRouter` for pieces #2–#5, (c) delegates the actual AS to a hosted provider so you own only the seam.
3. Validate with Opportunity Spark #2 — point the "MCP auth conformance checker" at your own gateway: 401 → WWW-Authenticate → 9728 → 8414 → PKCE. If it passes its own scanner, the spec is met.

## Open questions
- Does MCPAASTA run its own OAuth AS (RFC 8414 server), or wrap a hosted one? That single choice decides whether this is a weekend gateway or a quarter-long product.
- Is per-tenant `sub`→resource-owner mapping (the "multi-vendor nightmare" at brief:12) in scope for v1, or punted to the wrapped app?
