---
date: 2026-07-23
classification: research
action: Read the loadbearingtech verifier piece and write one paragraph on what a UIPE "verifier" would ground on — DOM-state is the real-world signal they say is missing.
source_brief: briefs/2026-07-23.md
---

## TL;DR
The loadbearingtech post's thesis (only 2 of 9 production self-improvement loops had a verifier grounded in real-world data; the verifier, not the model, is the bottleneck and the moat) lands squarely on UIPE's existing capability. A UIPE verifier grounds on **post-action rendered DOM/accessibility-tree state** — the observable delta between "before turn" and "after turn" — which is exactly the concrete, non-self-referential signal the piece says nobody builds. The two best public verifier write-ups (Vadim's UI-verification lane, Microsoft's Universal Verifier) independently converge on the same rule UIPE already embodies: *the agent explores, deterministic code judges, and the verifier never grades its own homework.* Dirk's move is not to build a verifier from scratch — it's to reframe UIPE's `compare_states` diff as the grounding primitive and borrow the two design ideas UIPE is currently missing (a rubric layer and a process/outcome split).

## The paragraph (the actual deliverable)
A UIPE "verifier" grounds on **DOM-state ground truth**: the structural + visual + temporal diff of the live page captured immediately before and after an agent turn. Where a self-critiquing agent asks "did I do it?" and hallucinates *yes*, UIPE answers from outside the agent's mind — it reads the actual rendered state (element presence/absence, text content, layout overflow, console errors, attribute changes) and reports whether the claimed change materialized. That is precisely the "real-world signal" loadbearingtech says the missing 7-of-9 loops lack: it is external, cheap to sample, deterministic, and independent of the generator. The verdict primitive is boolean and mechanical ("the agent said it added the item to the cart; the cart node is still empty → fail"), and an LLM may only *explain* a failure, never flip it. UIPE's honest limits are the same ones the research flags: DOM-state proves *the UI changed as claimed* (process/controllable ground truth), not *the user's goal was met* (outcome) — so a mature UIPE verifier needs a thin task-rubric layer on top of the raw diff to close that gap.

## Key findings
- loadbearingtech thesis (via brief, line 13): of 9 production loops, only 2 had a verifier grounded in real-world data; verifiers are the moat because they're slow and need expert failure-labeling — a cost UIPE largely sidesteps since DOM diffing is automatic, not hand-labeled.
- "The agent explores, the code judges" — deterministic assertions (HTTP status, >1px overflow, expected text, required selector, console errors) are the verdict; the LLM triage is env-gated and *can never flip a verdict*. (source: https://vadim.blog/computer-use-agents-ui-verification/)
- The trust rule = architectural separation: perception observes, evaluation judges. A verifier that "delays the decision or reinterprets ambiguous evidence" drifts and the audit trail collapses. UIPE's before/after snapshot already enforces this seam. (source: https://vadim.blog/computer-use-agents-ui-verification/)
- Microsoft's Universal Verifier: cut false-positive rate to ~0 (vs ≥45% WebVoyager) purely via *verifier design, not a bigger model* — "good rubric design alone accounts for roughly half the gains." (source: https://www.microsoft.com/en-us/research/articles/the-art-of-building-verifiers-for-computer-use-agents/)
- Separate **process from outcome** and **controllable from uncontrollable** failures — conflating them yields signals "too lenient or too harsh." This is the one axis UIPE's raw diff doesn't yet express. (source: same MS piece)

## Existing players / prior art
- Microsoft FARA / Universal Verifier — best-in-class CUA trajectory verifier + open CUAVerifierBench — https://github.com/microsoft/fara
- Vadim's verify_ui lane — ~400 LOC Playwright + pure-assert verdict; a working single-site version of the UIPE thesis — https://vadim.blog/computer-use-agents-ui-verification/
- Lilian Weng, "Harness Engineering for Self-Improvement" (2026-07-04) — grounding (tests/execution/retrieval/separate critics) beats self-critique's coherence trap — https://lilianweng.github.io/posts/2026-07-04-harness/

## Concrete next steps for Dirk
1. Lift the paragraph above into UIPE's positioning copy — it's the sharpest one-line answer to "what does UIPE ground on" you have: *post-action DOM-state as external verifier signal.*
2. Add a **process/outcome split** to `compare_states`: keep the raw diff as the process/controllable verdict, add an optional task-rubric field for the outcome verdict. This is the single highest-leverage feature the research surfaces and the current gap.
3. Steal Vadim's *built-server + lazy-import selftest* discipline as a credibility proof point: a verifier that provably can't run the browser inside its verdict function is the "never grades its own homework" story made concrete.

## Open questions
- Could not read the loadbearingtech primary post (not publicly indexed; thesis taken from the brief's synthesis). If Dirk has the URL, the "expert failure-labeling is the cost nobody pays" claim is worth confirming against their exact numbers before leaning on it in a pitch.
- Where does the task-rubric come from for a generic UIPE customer — user-authored per flow, or inferred from the agent's stated intent? That choice decides whether UIPE stays zero-config or becomes a labeling product (the exact cost loadbearingtech warns about).
