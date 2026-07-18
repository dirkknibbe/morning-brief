---
date: 2026-07-18
classification: research
action: Skim Orka (github.com/mathhMadureira/orka) and decide if its pre-execution interception model is a competitor, complement, or design to borrow vs UIPE's perception layer.
source_brief: briefs/2026-07-18.md
---

## TL;DR
Orka is the **action-layer admission point** your 2026-06-13 dossier called "unclaimed" — but it fills it with *economic + static-policy* inputs, not perception. It intercepts every agent action (`@guard` decorator / `/handover`), runs loop-detection, spend-cap, policy rules, a **declared** risk tier, optional human approval, then logs to a SHA-256 chained ledger. Nowhere does it perceive what an action *does* — `risk="LIMITED"` is a decorator argument, not a scene read. So Orka is **"Enforra/Otari for the tool-execution layer"**, and it is a **complement, not a competitor**: it's the enforcement shell UIPE should feed, and a *better* integration target than Enforra (Orka already ships policy + approval + ledger + spend; Enforra only had tool-name policy). The one real threat: Orka sits exactly on the seam UIPE positions around — if it ever makes risk scoring *perceptual*, it becomes your most direct competitor. Do **not** build the enforcement shell; Orka owns that lane. Pitch UIPE as the effect-sensor into Orka's risk score.

## Key findings
- Orka's capability list is entirely governance: loop guard, spend cap, savings ledger, human approval, immutable SHA-256 ledger, policy engine (task type / domain / quota / risk level), multi-protocol (MCP/A2A/REST). No "scene," "affordance," or "effect" anywhere. (source: https://github.com/mathhMadureira/orka/blob/main/README.md)
- Risk is **declared, not perceived**: `@orka.guard(risk="LIMITED")` — an EU-AI-Act-style static tier passed by the developer. This is precisely the gap UIPE fills — Orka can't know a click lands on "Delete Account." (source: README Economy section)
- Interception mechanics mirror UIPE's own seam thesis: SDK intercepts → server-side decision → execute → ledger. Same `/handover` verb AgentHandover used; Orka is the enforcement engine, UIPE the sensor. (source: README "How it works")
- Open-core model worth copying: MIT SDKs (decorator, REST client, integrations) + **closed managed backend** at orka.ia.br running the decision logic. Clean monetization split UIPE has no analogue for. (source: README "Open-core model")
- The tamper-evident **savings ledger** ("Orka saved you $X this week") is a proof artifact UIPE lacks — perception's value is currently unquantified; this is the framing to steal.

## Existing players / prior art
- **Orka** (mathhMadureira, PyPI `orkaia`, MIT SDK + managed backend) — agent action-governance: loop/spend/policy/approval/ledger — github.com/mathhMadureira/orka
- **Enforra** — tool-name+args action policy; weaker (no approval/ledger/spend). Orka supersedes it as an integration target.
- **Otari / any-llm-gateway** (mozilla.ai) — request-layer control plane (budget/routing). Orka is its tool-execution-layer cousin.

## Concrete next steps for Dirk
1. **Re-target the integration seam** from your 06-13 step 3: Orka > Enforra. Sketch how UIPE's `get_scene`/effect output populates Orka's `risk` input or a policy-engine field. Two paragraphs, no code.
2. **Steal the ledger framing.** Give UIPE a "perception prevented X" proof artifact — quantified value, not just "we see the screen."
3. **Draft one demo** Orka can't do alone: a static `risk="LIMITED"` action that is *actually* destructive on-screen; UIPE flags it, Orka's approval gate catches it. That's the "perception makes governance effect-aware" wedge.
4. **Do not** clone loop-guard/spend/ledger — that's Orka's moat, not yours.

## Open questions
- Does Orka's roadmap plan to make risk scoring perceptual (screen/effect-aware)? That single answer flips this from complement to competitor — check discussions/issues before any outreach.
- Is Orka's backend reachable enough to prototype a UIPE→Orka risk-injection without the closed service? "Local/offline mode on the roadmap" suggests not yet.
