---
date: 2026-09-20
classification: research
action: Clone Fentaris, read routing/identity/rate-limit code, decide MCPAASTA wedge — host Fentaris + add metered billing vs. build from scratch.
source_brief: briefs/2026-09-20.md
---

## TL;DR
**Host + meter. Do not build from scratch.** Fentaris is MIT-licensed, so you can host it commercially and bolt a proprietary billing layer on top with zero license friction. It already ships every hard, boring part of MCPAASTA's gateway — stable routing/namespacing, identity (API keys + OAuth 2.1 + users/groups), policy, rate-limiting, middleware/hooks, structured observability. MCPAASTA's *only* real differentiator — per-call metered billing — plugs into two seams that already exist: the pluggable `RateLimitStore` interface and the `tool:success` event (which carries `durationMs`). Building the gateway yourself would re-do months of someone else's MIT work for no differentiation. The wedge isn't the proxy — it's multi-tenancy + billing + dashboard.

## Key findings
- **MIT license.** `LICENSE.txt` + README both confirm MIT. You can host, modify, and sell access without open-sourcing your billing layer. (source: https://github.com/Fentaris/fentaris/blob/main/LICENSE.txt)
- **Metering seam #1 — `RateLimitStore`.** `rate-limit/rateLimit.ts` defines a pluggable store (`increment(key,window)`, `consume`, `get`, `reset`) with an in-memory default. Swap in a persistent (Redis/DB) store keyed by tenant → that counter *is* your usage ledger. (source: https://github.com/Fentaris/fentaris/blob/main/packages/core/src/rate-limit/rateLimit.ts)
- **Metering seam #2 — observability hook.** README shows `app.on("tool:success", ({ctx, durationMs}) => ...)`. Emit a usage record per call here → push to Stripe metered billing. (source: https://github.com/Fentaris/fentaris/blob/main/README.md)
- **Production-shaped architecture.** `core/src` has dedicated `auth/`, `identity/`, `policy/`, `proxy/`, `credentials/`, `secrets/`, `isolation/`, `edge/`, `health/`, `lifecycle/` dirs. Credentials never leak to middleware/logs. This is not a toy. (source: https://github.com/Fentaris/fentaris/tree/main/packages/core/src)
- **No billing/metering anywhere** in the tree — confirms the gap MCPAASTA fills, and that it's additive, not a fork-fight.
- **No hosted competitor found.** GitHub search for a hosted/metered MCP gateway returned 0 repos. Greenfield — or a weak demand signal. The brief's "demand is proven" is *asserted, not verified* by this research.

## Existing players / prior art
- **Fentaris** — self-host OSS MCP control plane; the exact blueprint. MIT. — https://github.com/Fentaris/fentaris
- **Enjambre OS** — overlapping "governed router in front of MCP" (from brief); check before committing.
- Hosted/metered MCP gateway — **none found** on GitHub as of today.

## Concrete next steps for Dirk
1. **Fork** Fentaris (MIT, safe) — you'll pin/patch, not just track. It's young (created 2026-05-28); expect API churn.
2. **Spike the metering seam (one afternoon):** implement `RedisRateLimitStore implements RateLimitStore` + a `tool:success` handler that writes usage rows. If both work, the whole thesis holds.
3. **Decide the tenancy model first** — instance-per-tenant (use `isolation/`) vs. one shared instance with tenant-scoped identity. This, not the proxy, is the real build.
4. **Wire Stripe metered billing** to the usage rows from step 2.
5. **Validate demand before building the control plane.** The "proven demand" claim rests on one repo + one HN thread. (See prior dossier: `actions/2026-09-15-keydris-per-call-metering.md`.)

## Open questions
- Is demand real, or is it one OSS repo and a brief's optimism?
- Does Fentaris's own roadmap include a hosted/billed tier? (Check their docs/issues — if yes, the wedge closes.)
- Instance-per-tenant vs. shared-instance isolation — cost and blast-radius tradeoff unresolved.
