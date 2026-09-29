---
date: 2026-09-29
classification: research
action: Decide whether UIPE's temporal-perception angle extends into flow-scoped guardrails (read OpenAPPA how-it-works + benchmark + DASP spec).
source_brief: briefs/2026-09-29.md
---

## TL;DR
Yes on the concept, no on the obvious build. Flow-scoped guardrails (OpenAPPA, Columbia DAPLab's DFC) are literally *temporal state-tracking over a trajectory* — a monotonic security label that only tightens as an agent reads data. That is the same shape as UIPE's temporal-perception, so the angle extends naturally. But the *enforcement* half of that space is already occupied by well-funded, paper-backed, MIT-licensed players (OpenAPPA, Cedar, OPA, Microsoft FIDES, DAPLab). Don't build a rival policy algebra — you'll lose. The real gap is **perception of the flow state over time**: what the agent read, how trust degraded, why an action was blocked. OpenAPPA ships this (Observability, `appa yell`) as its weakest, most generic surface. That's where UIPE fits.

## Key findings
- OpenAPPA is a *deterministic* guardrail built on APPA (Agentic Permissions Policy Algebra): every trajectory carries an `audience × trust` label that only ever gets more restrictive; decisions are derived algebraically, outside the agent loop, so prompt injection can't touch it (source: https://openappa.com/how-it-works).
- Their pitch against the field: probabilistic "auto-mode" judges (Claude, Codex) *cannot track data flow across tool calls* and cap ~99.3% — 0.7% breach at scale. This is exactly a temporal/stateful argument (source: https://openappa.com).
- Benchmarks: 0% attack success across 1,320 evals (Bench-Corp + AgentThreatBench), 88–90% task completion vs FIDES's 37–45%, 4.22% token overhead. Credible, not hand-wavy (source: https://openappa.com/evaluation).
- Columbia DAPLab's **Data Flow Control (DFC)** is the same idea from academia — "deterministic policy language for agent data safety… near-zero overhead," plus StateFork ("rewind button") for branching agent state (source: https://daplab.cs.columbia.edu).
- "The DASP spec" has no single canonical match — the web returns Durable Actor Session Protocol, Microsoft's Data/Agent Governance Accelerator, and the old Decentralized App Security Project. Couldn't confirm which one you meant (source: https://github.com/DASP-Protocol/dasp).

## Existing players / prior art
- OpenAPPA — deterministic flow-tracking guardrail, MIT, benchmarked — https://openappa.com
- Columbia DAPLab DFC / StateFork — academic deterministic data-flow control — https://daplab.cs.columbia.edu
- Microsoft FIDES — the benchmark punching bag (28–35% ASR) — referenced in OpenAPPA benches
- Cedar / OPA — general policy engines OpenAPPA positions against — https://openappa.com (comparison pages)
- Microsoft Agent Governance Toolkit — OWASP Agentic Top 10 coverage — https://github.com/microsoft/agent-governance-toolkit

## Concrete next steps for Dirk
1. **Reframe the bet.** UIPE ≠ guardrail engine. UIPE = the temporal *perception/observability* layer *over* a guardrail's flow state. Don't compete with the algebra; consume it.
2. **Spike, don't build.** OpenAPPA is MIT + declarative `appa.toml`. Wire a throwaway agent through it, capture the trajectory labels, and render a UIPE timeline: trust degradation, audience narrowing, blocked-action reasons. One afternoon tells you if the visualization is compelling.
3. **Send me the actual DASP URL** so I can check whether it defines a state/trace format UIPE could ingest directly (that would make the perception layer a clean plug-in rather than a scraper).

## Open questions
- Which "DASP spec" did you mean? No canonical match found — this changes step 3 entirely.
- Is OpenAPPA's `appa yell` / Observability output structured enough to render, or is UIPE's value precisely that it isn't?
- Where's the money: is "make guardrail flow-state legible to humans" a product, or a feature OpenAPPA absorbs in one release?
