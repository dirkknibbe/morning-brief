---
date: 2026-08-12
classification: research
action: Read Parley's feature list and pricing end to end, then write one paragraph on where UIPE's temporal-perception primitives complement rather than compete with agent-coordination infra.
source_brief: briefs/2026-08-12.md
---

## TL;DR
Parley (parley.weldra.dev, Weldra) sells *agent-to-agent* coordination as a hosted MCP service: durable messaging, file-claim soft-locks, injection-aware trust labels, and an append-only flight recorder, priced per-workspace ($0 for 2 agents, $19/mo for 20). Every one of its primitives operates on the **coordination bus** — what agents say to each other and which *files* they touch. None of them touch the **live world** an agent acts on: whether the click landed, whether the DOM settled, whether the write was confirmed. That gap is exactly UIPE's lane. The positioning wedge is clean: **Parley coordinates agents with each other; UIPE verifies what the world did back.** They compose — UIPE emits the "action confirmed / page changed unexpectedly" verdict that a Parley handoff can gate on before it drops.

## The positioning paragraph (the deliverable)
> Parley records the conversation *between* agents — who handed what to whom, how far it got, how much to trust the sender. UIPE records the conversation between an agent and the *world* — whether the action it just took on a live UI actually did what it intended. These are orthogonal axes, and Parley's own primitives make the seam obvious. Its file-claim soft-locks are a **spatial** lease on repo paths so two agents don't clobber the same file; UIPE is the **temporal** equivalent for web UIs — a "UI-state claim/lease" so an agent doesn't act on a stale DOM another agent already mutated. Its injection-aware trust labels tag the provenance of an inbound *message*; UIPE's change-detection tags the provenance of an unexpected *page mutation* after an action — the same "is this trustworthy" instinct, aimed at the world instead of the bus. And its append-only flight recorder logs relays and claims but has no notion of *outcome* — UIPE's signed perception receipts ("intent confirmed at 14:22:07") are exactly the per-action verdict that timeline is missing. Coordination infra assumes actions succeed and moves the token to the next agent; perception infra is what confirms they did. Parley makes the handoff durable; UIPE makes the handoff *earned*.

## Key findings
- Parley's six built-in primitives are all coordination-bus concerns: async store-and-forward with resume cursors, per-prompt auto-check, human-in-the-loop escalation (Slack/Telegram paging), file-claim soft-locks, injection-aware trust labels, append-only flight recorder. (source: https://parley.weldra.dev)
- File-claims are explicitly **advisory claims on file paths** — spatial, repo-scoped, no temporal/DOM analog. This is the exact hook the brief's "UIPE ↔ soft-locks" spark named. (source: https://parley.weldra.dev)
- Trust labels operate on **inbound messages** ("the body stays data, never instructions") — provenance of the bus, not of the world. UIPE's "page changed unexpectedly after my action" is the world-facing sibling. (source: https://parley.weldra.dev)
- Pricing is per-workspace freemium ($0 / 2 agents → $19/mo / 20 agents → Enterprise). MCP-client-agnostic (Claude Code, Cursor, Codex, Copilot, Antigravity). A UIPE MCP tool would slot next to it as a *second* connected server, not a competitor. (source: https://parley.weldra.dev)
- The GitHub `nkuhanas/Parley` project (obligations/plans/boards, OpenClaw adapter) is a *different, deeper* coordination model but confirms the category direction — recovery/coordination state, still zero world-perception. (source: https://github.com/nkuhanas/Parley)

## Existing players / prior art
- Parley / Weldra — hosted MCP agent-coordination bus, per-workspace pricing — https://parley.weldra.dev
- nkuhanas/Parley — durable obligations/plans/boards coordination backend, OpenClaw-first — https://github.com/nkuhanas/Parley
- Parallax / AgentCenter / deer-flow — orchestration + task-board coordination; all agent↔agent, none agent↔world.

## Concrete next steps for Dirk
1. Bank the positioning paragraph verbatim as UIPE's "vs. coordination infra" answer. The one-liner is: *Parley coordinates agents; UIPE verifies the world.*
2. Spike the thinnest interop proof: a UIPE MCP tool that emits a `ui_state_claim` (temporal soft-lock) and an `action_confirmed` receipt, framed to sit *beside* a Parley connection, not replace it — mirrors the kitesurf-wedge conclusion (perception as a co-connected sidecar).
3. When pitching, lead with the seam Parley itself exposes: file-claim (spatial) → UI-state-claim (temporal); message trust-label → page-change trust-label; flight recorder → perception receipt. Three named parallels, one per primitive.

## Open questions
- Would Weldra see a UI-state-claim as a natural extension of their claim model (partnership surface) or as scope creep they'd build themselves? Their claims are file-path-only today — no signal either way.
- Does Parley's flight-recorder event schema admit third-party event types? If so, UIPE receipts could write directly onto *their* timeline rather than a parallel one.
