---
date: 2026-06-13
classification: research
action: Read the 98% Problem survey, then sketch where UIPE's temporal-perception layer slots into a control plane — perception as the missing input to "should this request run."
source_brief: briefs/2026-06-13.md
---

## TL;DR
The survey's real claim: harness is ~98% of Claude Code, and permission/execution-safety is one of five subsystems — capability is now an *admission-control* problem. The control-plane category (Otari / mozilla.ai) is real and funded. **But every shipping control plane gates the model call on _economic_ signals — budget, rate, provider health. None gate the _action_ on _effect_: what the request will actually do.** That's the gap. UIPE's temporal perception ("this click lands on Delete Account; scene changed cart→checkout") is exactly the missing effect-input — but to a *second, lower* admission point at the tool-execution layer, not Otari's request layer. The wedge is real, but it's positioning, not new code: the buildable artifact is still the action-admission shim from your 2026-05-20 dossier. Do **not** build a budget gateway — Otari owns that lane.

## Key findings
- The survey is Liu et al., *"Dive into Claude Code"* (MBZUAI) — ~98.4% operational harness / 1.6% AI decision logic, five subsystems incl. permission + execution safety; philosophy "minimal scaffolding, maximal operational harness." Brief's "BeConfident Labs" attribution is wrong; fix it. (source: https://cobusgreyling.medium.com/98-of-claude-code-is-not-ai-bab2f37dee0e)
- mozilla.ai defines a control plane as deciding "should this request go through at all": pre-request budget enforcement, global policy, failover. Every decision input they list is economic/identity — none is semantic. (source: https://blog.mozilla.ai/what-is-an-llm-control-plane/)
- Otari (mozilla.ai, OSS, May 29) is the reference implementation: virtual keys, multi-level budgets, routing, OTLP traces. It gates the *LLM request*, not the *tool execution*. The action-layer admission point is unclaimed. (source: https://blog.mozilla.ai/otari-own-your-ai-stack/)
- "93% of permission prompts get approved" (your brief) — human-in-loop admission is a *measured* failure. That's the argument **for** automated effect-aware admission: perception supplies the signal a tired human rubber-stamps.
- Tool-name policies are blind to vision-model clicks (your 05-20 finding): a screenshot→click(x,y) never invokes `terminal.run`. UIPE's scene/diff is the only thing that knows the click hit "Delete Account." (source: actions/2026-05-20-uipe-enforra-affordance-policy.md)

## Existing players / prior art
- **Otari / any-llm-gateway** (mozilla.ai) — request-layer control plane; budget/policy/routing. The category leader to integrate-with, never clone. https://blog.mozilla.ai/otari-own-your-ai-stack/
- **Enforra** — tool-name+args action-policy SDK; closest to action-layer, lacks affordance fields. https://enforra.com
- **Invariant Labs (Snyk)** — enterprise agent-security; lane closed to an indie.

## Concrete next steps for Dirk
1. **Write the positioning piece first** (~800 words): *"The control plane everyone's building is blind to what the action does."* Three traces — Otari budget-block (works), a tool-name policy that can't see a vision click (fails), UIPE-fed effect admission (works). This essay IS the wedge artifact; ship narrative before code.
2. **Name the two admission points** in one diagram: (a) request-layer (Otari, economic, solved) and (b) action-layer (effect, unclaimed). Position UIPE as the *perception input to (b)*. Ship as an RFC/README in `~/uipe/`, not as a product yet.
3. **Pick the integration seam before building** — they're mutually exclusive go-to-markets: Otari guardrails hook? Enforra context fields (your 05-20 adapter)? Or the standalone "MCP trust proxy" from today's Opportunity Sparks? Choose one.
4. **Re-test the moat** (05-20's open question still stands): can a thin Playwright a11y-tree shim emit the same effect signal without UIPE? If yes, UIPE is undifferentiated here — answer before any build.

## Open questions
- Does Otari intend to extend down to tool-execution admission? If yes, "perception as input" is a feature request to them, not a standalone product — check their roadmap/guardrails plans.
- Is "effect-aware admission" buyable as its own SKU, or only as a feature inside an existing control plane / sandbox?
