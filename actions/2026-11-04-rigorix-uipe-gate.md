---
date: 2026-11-04
classification: research
action: Run Rigorix's gate demo + read spec; decide if UIPE (perception) and Rigorix (enforcement) are a bundle, a port target, or a threat.
source_brief: briefs/2026-11-04.md
---

## TL;DR
Rigorix is **not a threat — it's a socket UIPE plugs into.** Its enforcement engine is deterministic Rust with *zero models in the decision path*, and it explicitly refuses to do perception ("Rigorix does not guess what 'beneficiary' means"). That refusal is exactly UIPE's job. The high-value move is a **port, then a bundle**: wrap UIPE as a Rigorix *dispatch-time precondition* (ADR-017) — an HTTP/argv check that re-perceives the UI at the moment of consequence and returns pass/deny/unknown. Rigorix already defines the contract: unknown → refuse, provider answer is "evidence not authority." That maps 1:1 onto "UIPE perceives, Rigorix decides." Don't build a competing gate.

## Key findings
- **The thesis is identical, one layer apart.** Rigorix: "a yes is a statement about the world at the time it was given; the approval doesn't change, the world does." It re-reads authority at dispatch, never caches across the gap. UIPE says the same about *UI state* vs *plan time*. (source: https://rigorix.eu/)
- **Preconditions are the port target.** ADR-017: operator authors a deterministic external check (argv or HTTP determination service) run immediately before a step's tool fires. `action = "deny"` or `"promote"`. Anything not a definite pass refuses. UIPE fits as that HTTP service. (source: https://github.com/arman-jalili/rigorix-oss README §4)
- **Non-inheritance (R4) protects UIPE's role.** "A provider's permitting answer is evidence, not authority… unknown never becomes authority." UIPE supplying UI-drift facts can't be blamed for the decision — clean separation of duties, and it means UIPE *doesn't* need to be trusted infra. (source: README §4)
- **Zero-model enforcement = they will never eat the perception layer.** Design principle #4: "No model judgment inside enforcement." Perceiving fuzzy UI state needs a model; it's structurally out of scope for them. (source: spec §"Design principles", https://github.com/arman-jalili/rigorix-oss/blob/main/docs/spec/execution-governance/README.md)
- **Spec is a fresh public review draft** (v0.2.0, 2026-10-25). Apache-2.0/MIT, verifier published to crates.io/npm/PyPI. Early enough to shape the integration story. (source: spec README)
- **The gate demo is illustrative, not a live trace** — the rigorix.eu payments animation (frozen beneficiary → REFUSED/SIGNED) is a schematic. No running system to benchmark against yet.

## Existing players / prior art
- Rigorix (arman-jalili/rigorix-oss) — deterministic execution-governance engine, MCP-layer agents run inside — https://github.com/arman-jalili/rigorix-oss
- Success6666/agent-runtime-governance, qstackfield/authority-before-execution — thin lookalikes riding the same wave; not competitive with UIPE's perception angle.

## Concrete next steps for Dirk
1. Read ADR-017 + spec §4.3.1 (authority-fact projection by re-derivation) in full — that's the exact contract UIPE's output must satisfy.
2. Sketch a UIPE→Rigorix precondition adapter: HTTP endpoint returning `{pass|deny|unknown}` + a UI-state digest, given a step + the plan-time UI snapshot. One page, no code.
3. Open a GitHub Discussion on the repo (don't PR) framing "UI-drift as a precondition determination source" — tests whether the maintainer sees perception as in-scope-for-others. Gauges bundle appetite before you build.

## Open questions
- Does Rigorix's determination-service HTTP contract expose enough plan context (the step + its assumed world state) for a perceiver to compare against *current* UI? Or is it key/value only?
- Is there appetite upstream for a first-party "perception provider" interface, or does that stay a third-party concern by design?
