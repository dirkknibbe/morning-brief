---
date: 2026-09-16
classification: research
action: Skim CTRLRun's repo — check if its "agent action" schema is a structured action-log UIPE could emit into (distribution channel, not competitor)
source_brief: briefs/2026-09-16.md
---

## TL;DR
CTRLRun is **not** an action-log sink you emit into — it's an in-process Python decorator (`@ctrlrun.protect`) that sits *inside* the agent, between the decision to act and the call that acts, and gates it against a local policy file. It does not ingest a structured action-log from outside; it *produces* one (append-only `receipts.jsonl` / Postgres / OpenTelemetry) as output. So it's not a distribution channel for UIPE in the "emit actions into it" sense. The only real interop surface is the **receipt/OpenTelemetry stream** (an output) and the **OpenAI Agents SDK adapter** (an in-process hook). Verdict: adjacent safety library, not a channel — unless UIPE is itself a Python agent process willing to wrap its own consequential calls, in which case CTRLRun is a *dependency to adopt*, not a place to publish to.

## Key findings
- CTRLRun bills itself as "the execution safety layer for AI agents… A Python library that sits between the decision to act and the call that acts." (source: https://github.com/CTRLRun/ctrlrun)
- Integration is per-function, in-process: "This is the whole integration for a function in your own process" — you decorate the call, not POST an action to a service. (source: https://docs.ctrlrun.dev/)
- The "action schema" is a **policy** (`schema: ctrlrun.policy/v2`, YAML: actions → effect key → allow/approve/deny rules), evaluated locally. It is not an inbound event schema. (source: repo README)
- Output is a structured, chained action-log: `receipts.jsonl` + `events.jsonl`, prunable/anchorable, exportable to OpenTelemetry. This is the closest thing to the "structured action-log" Dirk hypothesized — but it flows *out*, not *in*. (source: docs.ctrlrun.dev, README)
- Explicit non-goals: no prompt-injection detection, no rollback, no exactly-once against remotes it doesn't control. It "contains the consequence rather than reading the cause." (source: README "Where it stops")
- Distribution reality: the standardized channel for agent actions here is **OpenTelemetry**, not a CTRLRun-proprietary format. If UIPE wants to ride an emerging standard, OTel-for-agents is the bet, not CTRLRun's schema. (source: docs "Export to OpenTelemetry")

## Existing players / prior art
- CTRLRun — in-process policy gate + tamper-evident receipts for agent actions; Apache-2.0, on PyPI — https://github.com/CTRLRun/ctrlrun
- OpenTelemetry (GenAI/agent semantic conventions) — the actual cross-tool action-telemetry standard CTRLRun exports into — https://opentelemetry.io
- OpenAI Agents SDK — CTRLRun ships an adapter for it, i.e. it integrates at the framework layer, not via an action-log API

## Concrete next steps for Dirk
1. **Drop the "distribution channel" framing for CTRLRun.** It has no inbound action-log API; you can't emit into it without embedding it as a Python dependency in the acting process. 30-sec decision, done.
2. If the interest is *interop*, look at CTRLRun's **receipt schema** as a format UIPE could emit in (or read), and check whether its OpenTelemetry export uses GenAI semantic conventions — that's the real shared surface. ~1 hr: read docs.ctrlrun.dev/receipts + the OTel export page.
3. If UIPE is a Python agent that takes consequential actions, evaluate CTRLRun as a *safety dependency* (approve/deny/receipts) — a different, more plausible relationship than "channel." ~30 min skim of the 3-step quickstart.

## Open questions
- What is UIPE's runtime and role here — a Python agent that *takes* actions (→ CTRLRun is a dependency), or a system that wants to *record/publish* actions elsewhere (→ CTRLRun is irrelevant, OTel is the target)? The action assumes CTRLRun ingests; it doesn't, so the right comparison depends on this.
- Does CTRLRun's OpenTelemetry export follow the GenAI agent semantic conventions, or a custom shape? That determines whether "emit UIPE actions in a CTRLRun-compatible way" is even a standards play.
