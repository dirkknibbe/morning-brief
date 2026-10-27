---
date: 2026-10-27
classification: build-plan
action: Spike a 1-file cursor-trajectory classifier against UIPE's event stream to prove privatrak's "pointer gives them away" claim, then decide detector-product vs UIPE-feature.
source_brief: briefs/2026-10-27.md
---

## TL;DR
The pointer tell is real and the classifier is almost trivial to build — but it's a window, not a moat. privatrak found every one of 13 clicking agents arrives at the button in a single 200–840px jump with 0–2 other pointer moves, while humans take many small steps (last step 0–2px, 11–642 moves total). That's a one-line threshold, not an ML problem. Mouse-dynamics bot detection is a decade-old, academically crowded, incumbent-owned field, and the one rigorous adversarial study shows the tell collapses once agents bother to synthesize trajectories (they don't today). **Recommendation: build the spike as a UIPE feature/demo, not a standalone detector product.** The durable play in this dataset is provenance (Web Bot Auth), not detection.

## Key findings
- The tell held for **all 13 clicking agents, every run** — including Claude computer-use (OS-level clicks) and the two agents that fake human button-hold timing. Agents teleport the pointer onto the target; humans don't. (source: https://privatrak.com/blog/ai-agents-in-analytics)
- Other tells already fail: Browser Use and Comet hold the button 82–453ms like a person; dwell-time is dead. The pointer-path is the *last* surviving behavioral signal — and only because agents don't synthesize motion at all. (source: privatrak, same)
- Detection is near-trivial and very accurate *on current agents*: "Kinematic Features Are All You Need" hits EER ≤ 0.001 / TPR > 99.5%, and notes even logistic regression works — human-vs-synthetic is ~linearly separable. BeCAPTCHA-Mouse: 93% from a *single* trajectory. (sources: https://ckoi.dev/papers/kinematic-features-are-all-you-need.pdf , https://doi.org/10.1016/j.patcog.2022.108643)
- **Contrarian finding:** the same kinematic paper runs a 5-round adversarial loop — attacker mean evasion recovers from 0.999 to 0.010 by round 5. It's an arms race. You win today only because agents literally jump the cursor; the moment they care, the moat is gone.
- Fingerprinting LLM browser agents via UI traces is *already* being published (FP-Agent @ ACM IMC 2026; "Known By Their Actions", arXiv 2605.14786). The "detector product" idea is current academic output — not a defensible wedge.

## Existing players / prior art
- privatrak — the source study (49 runs, 23 agents, 8 human setups) — https://privatrak.com/blog/ai-agents-in-analytics
- Kinematic Features Are All You Need — 17-feature trajectory detector + adversarial eval — ckoi.dev
- BeCAPTCHA-Mouse — neuromotor mouse-dynamics detector + GitHub benchmark — patcog 2022
- FP-Agent / "Known By Their Actions" — academic LLM-agent fingerprinting via UI traces — arXiv
- Incumbents already do behavioral mouse biometrics: reCAPTCHA v3, DataDome, HUMAN/PerimeterX
- Web Bot Auth (Manus, IETF draft) — the provenance alternative; only 1/23 agents signed requests

## Concrete next steps for Dirk (the spike, ~2–3 hrs)
1. Confirm UIPE's event stream emits raw `pointermove` as `(x, y, t)` + click events. If it only logs high-level perception events, add a thin capture listener first.
2. Capture two sessions on one UIPE page: one human (your trackpad), one agent (a plain Playwright script clicking the same targets).
3. Write the 1-file classifier — **no ML.** Per click, compute: (a) max single-step pointer displacement in the last move before the click, (b) count of pointermove events on the page. Rule: `lastStep > ~50px AND totalMoves <= 2 → agent`. This reproduces privatrak directly.
4. Validate: it must fire on the agent capture and stay silent on the human one. If it misfires, tune the two thresholds — don't reach for a model.
5. Write the decision into the PR body: ship as a UIPE "session is agent-driven" perception signal + demo. Do **not** spin out a detector product. If you want a durable provenance play, prototype Web Bot Auth verification instead.

## Open questions
- Does UIPE currently record raw `pointermove (x,y,t)`, or only clicks / higher-level perception events? (couldn't inspect the UIPE repo from here)
- privatrak flagged macOS Dwell/Voice-Control and fast trackpad swipes as also clicking "fast / in one jump" — will the simple rule false-positive on accessibility tools and touch? Test before trusting it as a gate.
