---
date: 2026-10-19
classification: research
action: Read the WhatsApp-MCP Cloudflare deploy flow (OAuth KV + Durable Object + Workers Paid) as a reference for shipping UIPE as a one-click, pay-your-own-infra MCP.
source_brief: briefs/2026-10-19.md
---

## TL;DR
`finereli/whatsapp-mcp` is the cleanest live example of the Cloudflare remote-MCP-with-auth pattern: a **stateless Worker** routes OAuth, a **single Durable Object** ("owner") holds all state in its own SQLite, **KV** stores OAuth tokens, and a cron keeps data fresh. "Pay-your-own-infra" works because the user deploys to *their* Cloudflare account — Dirk pays nothing to host. But it is **not actually one-click**: setup is `git clone` + 3 CLI commands (`kv create`, `secret put`, `deploy`) + a browser pairing step. And the **Workers Paid (~$5/mo)** requirement is situational — it exists *only* because WhatsApp's first history import is CPU-heavy (`cpu_ms: 300000`). If UIPE has no such burst, it runs on the free plan and that barrier disappears. Adopt the architecture; don't inherit the "one-click" or "Paid-required" framing uncritically.

## Key findings
- **Three-part topology**: stateless Worker (`@cloudflare/workers-oauth-provider` wiring) → one Durable Object per owner (SQLite = all state) → KV (OAuth token store + pending sign-in). Cron trigger for background refresh. (source: https://github.com/finereli/whatsapp-mcp/blob/main/README.md)
- **Pay-your-own-infra = deploy-to-user's-account**: template repo (`wrangler.jsonc`), user runs `npm run deploy` in their own account. Zero hosting cost to the author; each user owns their data. (source: README "Set it up")
- **Workers Paid is not inherent to MCP** — it's forced by `"limits": { "cpu_ms": 300000 }` for the one-time protobuf-heavy import. UIPE likely has no equivalent burst → free plan. (source: https://github.com/finereli/whatsapp-mcp/blob/main/wrangler.jsonc)
- **Single-tenant by design**: DO is addressed by the fixed name `owner`, `userId` is the constant `'owner'`. Multi-user = key the DO on signed-in identity (README "Make it multi-user"). Decide this early for UIPE.
- **Auth is pluggable**: `auth.ts` picks a mode — password (default) or external login service (`LOGIN_ORIGIN` + `OWNER_EMAIL`). MCP clients see only an opaque bearer token. (source: README "Configuration")
- **Not truly one-click**: the repo deliberately uses clone+CLI, not a "Deploy to Cloudflare" button — because KV-namespace creation and secret-setting can't be fully automated by the button. (source: README "Set it up")

## Existing players / prior art
- `finereli/whatsapp-mcp` — the reference; read-only WhatsApp MCP on Workers+DO+KV, OAuth, single-tenant — https://github.com/finereli/whatsapp-mcp
- Cloudflare `remote-mcp-server-with-auth` template — the canonical starting skeleton this pattern derives from (same `workers-oauth-provider`).

## Concrete next steps for Dirk
1. Read `src/index.ts` in that repo — the OAuth-provider wiring + sign-in routes are the directly reusable piece for UIPE's MCP auth. That's the ~20-min payoff, not the WhatsApp/Baileys parts (which you'd throw away).
2. Decide UIPE's tenancy: single-tenant-per-deploy (simplest, matches this repo) vs multi-user (key DO on identity). This is the one decision that shapes everything downstream.
3. Check whether UIPE has any CPU-heavy one-shot operation. If not, drop the `limits` block → free-plan deploy → kills the "needs Workers Paid" friction for adopters.
4. Pick your delivery story: clone+CLI (honest, 3 commands) vs chase a real "Deploy to Cloudflare" button (needs KV/secret automation — more work, often still leaves a manual secret step).

## Open questions
- Does UIPE need persistent per-user state (justifying a DO + SQLite), or is it stateless request/response? If stateless, you can drop the Durable Object entirely and simplify to Worker + KV.
- Does UIPE already have an identity/auth model, or would it adopt this repo's password-vs-login-service split?
