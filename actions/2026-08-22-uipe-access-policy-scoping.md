---
date: 2026-08-22
classification: research
action: Spec a one-page "UIPE access policy" note — can UIPE temporal snapshots carry per-user visibility scoping, or is enforcement downstream? Potential paid tier.
source_brief: briefs/2026-08-22.md
---

## TL;DR
Enforcement is **downstream, at snapshot retrieval — not in the snapshot payload.** DeepSQL's lesson ("the agent's service account is a superset of every human's authority") does *not* apply to UIPE at capture time: UIPE perceives the DOM *as rendered to one authenticated session*, so the snapshot is already scoped to that user's authorized view by the app's own rendering. UIPE **witnesses** the scope; it doesn't enforce it. The superset problem only appears once UIPE *stores a history* of many users' snapshots in one place — a second user querying that history could see another user's rendered PII. That storage/retrieval layer is the only place a paid governance tier makes sense, and it presupposes a hosted, multi-tenant UIPE **that does not exist yet** (UIPE is still stdio-only, no HTTP entry — the same month-old blocker from 07-15/08-18). So: real technical answer below, but this is the ~7th UIPE spec and nothing ships. Don't write tier #2 before the HTTP shim exists.

## Key findings
- DeepSQL's fix = resolve English policy → deny-list, enforced *before* schema enters the context window (denied tables never introspected); impersonation shipped *first* so audit logs read as the human, not `deepsql_agent`. (source: briefs/2026-08-22.md lead + https://news.ycombinator.com/item?id=47911512)
- The DeepSQL trap is a **god-account superset**: one DB connection sees every user's rows. UIPE is structurally *not* that — it captures a rendered session, i.e. one user's already-filtered view. Capture-time scoping is inherited from the app, free. (source: actions/2026-08-04-armature-uipe-positioning.md — UIPE = ground-truth "did it land in the rendered DOM")
- The superset reappears at **snapshot storage**: temporal history across sessions/tenants in one store → retrieving another user's snapshot leaks their rendered PII. This is where per-principal deny-list + impersonation-tag + read-audit becomes worth charging for. Enforcement lives at *retrieval*, not in the snapshot bytes.
- A snapshot can carry a scope **tag** (`captured_as: user_X, tenant_Y`) for attestation/audit, but the tag must not be the enforcement point — that's the "read-only connection is not an access policy" mistake one layer up.
- Recurring blocker (07-15, 08-18): UIPE speaks MCP JSON-RPC over **stdio**, no HTTP entrypoint, no multi-tenant store. A retrieval-governance tier has no surface to attach to until that shim exists.

## Existing players / prior art
- DeepSQL — English→deny-list + per-user impersonation for text-to-SQL — briefs/2026-08-22.md
- Heimdall — STRONG/WEAK/STALE trust verdicts on stored knowledge (the "trust-verdict for temporal data" spark, opp #27) — briefs/2026-08-22.md
- Prior UIPE spec pile — 08-18 (metered endpoint), 08-19 (governed-action), 08-21 (x402 mcp-gate): all conclude "stop specifying, build the shim." — actions/2026-08-18-metered-uipe-x402-endpoint.md

## Concrete next steps for Dirk
1. **Bank the one-line answer, skip the one-pager:** scoping is upstream (app rendering) at capture; the paid tier is *retrieval-time* deny-list + audit on a multi-tenant snapshot store. That's the whole note.
2. **Gate it behind reality:** a retrieval-governance tier requires hosted multi-tenant UIPE. That needs the HTTP shim first (the actual unbuilt thing, per 08-18). No shim → no store → no tier → no spec.
3. **If you touch anything today, do the shim spike, not spec #7.** Same recommendation the last three UIPE dossiers made.
4. **Cheap real win:** add a `captured_as` scope tag to the snapshot schema now (attestation only, ~1 field) — it costs nothing and is the audit hook the future tier would need.

## Open questions
- Will UIPE ever store cross-user snapshot *history* server-side, or stay a per-session local oracle? If the latter, the superset never forms and there is **no** access-policy tier to sell.
- Does any current UIPE caller hold snapshots for more than one principal in one process? That's the only thing that turns this from "not a problem" into a paid problem.
