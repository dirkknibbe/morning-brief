---
date: 2026-09-30
classification: build-plan
action: Read Agentcap + Runtape READMEs, then draft a one-page spec for a UIPE "action receipt" — before/after UI-state diff per agent action.
source_brief: briefs/2026-09-30.md
---

## TL;DR
The "agent accountability" category is real and forming right now, but the two named tools sit at layers UIPE can't reach and doesn't compete with. **Runtape** answers *why* (which context caused a decision — input causality, offline, per-failure). **Agentcap** (yeet-src, eBPF) answers *what touched the machine* (syscalls, ports, files per agent). Neither captures the **semantic effect on the application** — what visibly changed because the agent acted. That is precisely what UIPE already perceives, and no one owns it. The action receipt is a legitimate wedge. Build the thinnest possible version: capture UIPE state immediately before and after one agent action, diff it, emit a human-readable receipt. Ship it as a read-only record first; don't touch policy/enforcement in v1.

## Key findings
- Runtape works on *recorded* runs, reruns only the model call (nothing re-executes), and is explicitly "for investigating a failure, not monitoring every decision" — 100-250 model calls per query (source: github.com/RehanMohammed985/runtape). It is a debugging tool, not a live accountability ledger. No overlap with a per-action receipt.
- Agentcap-yeet audits at the **kernel** — "tools run, domains, ports, files, CPU" via eBPF, no SDK, no app changes. It sees `curl`/`bash`/file I/O but has zero notion of *UI meaning* ("a row was added", "the invoice was marked paid") (source: github.com/yeet-src/agentcap).
- Agentcap-huggingface is a different tool sharing the name: capture agent↔model **wire traffic** → HF datasets for eval. Also no UI/effect layer (source: github.com/huggingface/agentcap).
- Common shape across all three: capture → persist → inspect/attribute. The receipt fits the same mental model but at the **effect/UI layer** — the one gap.
- Framing that lands: runtape = *cause*, agentcap = *resource*, UIPE receipt = *effect*. Three non-overlapping layers of one accountability stack.

## Existing players / prior art
- runtape — counterfactual "why did the agent decide X" + regression tests — github.com/RehanMohammed985/runtape
- agentcap (yeet) — eBPF per-agent syscall/network/file audit + Grafana — github.com/yeet-src/agentcap
- agentcap (HF) — capture agent↔model wire traffic as datasets — github.com/huggingface/agentcap
- LangSmith / Langfuse / Laminar — hosted trace+replay; step logs, not UI-effect diffs
- Closest analog outside agents: visual-regression tooling (Percy/Chromatic) — diffs UI, but not tied to a discrete agent action or authored as a receipt

## One-page spec (v1 — "action receipt")

**Goal:** For each agent action UIPE observes, emit a receipt: `{action, before_state, after_state, diff, timestamp}` — a verifiable, human-readable record of what the app looked like before and after.

**Scope (in):** single-action capture; UI-state snapshot (whatever UIPE already produces — DOM/a11y tree/screen); structural diff; markdown/JSON receipt written to disk. **Scope (out, v1):** enforcement/blocking, multi-action sessions, signing/tamper-proofing, hosted storage, video.

**Data model:**
```
Receipt { id, ts, action{type, target, args?},
          before: UIPEState, after: UIPEState,
          diff: [{path, kind: added|removed|changed, from?, to?}],
          summary: string }
```

**Flow:** hook the point where UIPE already emits/observes an action → snapshot before → let action complete → snapshot after → diff the two states → render one-line `summary` + structured `diff` → append to `receipts/`.

**Hard question to resolve first:** does UIPE expose a *pre-action* hook, or only post-hoc perception? If only post-hoc, v1 becomes "diff between consecutive perceived states" and the "action" is inferred/attached, not captured atomically. This changes the whole design — resolve before writing code.

## Concrete next steps for Dirk
1. Grep UIPE for where an agent action is observed and where state is snapshotted — confirm whether a *before* hook exists (answers the hard question above).
2. Nail the `diff` primitive: pick the state representation UIPE already emits and write the smallest structural differ over it (reuse an existing deep-diff lib, don't hand-roll).
3. First PR: `Receipt` type + `captureReceipt(action)` that writes one markdown receipt for one action to `receipts/`. Read-only, no enforcement. That's the whole wedge, shippable in an afternoon.

## Open questions
- Does UIPE have a pre-action interception point, or is perception strictly post-hoc? (Blocks the atomic-capture design.)
- Is the accountability buyer the same as UIPE's current user, or a new persona (compliance/QA)? Wedge value depends on who pays for "what changed."
