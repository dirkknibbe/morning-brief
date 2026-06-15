---
date: 2026-06-15
classification: build-plan
action: Prototype plan/execute split on a real UIPE task — Opus plans, Haiku implements — log the cost delta; if the spread holds, package as a routing MCP.
source_brief: briefs/2026-06-15.md
---

## TL;DR
The thesis is sound and externally proven — the brief's own Kilo data point shows a plan/implement split banking 59%. But the "Opus plans, **Haiku** implements" framing hides the load-bearing risk: Kilo's cheap implementer was GPT-5.5 (frontier-tier), **not** a Haiku-class small model. The spread is only real if Haiku 4.5 can faithfully implement an Opus plan and pass the *same* checks. So run this prototype as a **measurement, not a foregone conclusion**: one real UIPE task, identical acceptance rubric for both paths, log tokens + pass/fail. Don't package the MCP until Haiku's output passes on ≥1 real task. The cost ceiling is attractive (5× on both input and output), but unverified.

## Key findings
- Pricing confirmed (authoritative, claude-api skill): **Opus 4.8 = $5/$25 per MTok** (in/out), **Haiku 4.5 = $1/$5**. Clean 5× spread both directions — so the win scales with how token-heavy the implement phase is vs the plan phase (usually implement ≫ plan).
- The spread only materializes if you keep *planning* on Opus and move the *bulk implement tokens* to Haiku. If a task's tokens are plan-dominated, routing saves little.
- **Context-window cliff:** Haiku 4.5 caps at **200K** context vs Opus's 1M. A real UIPE perception task that feeds large screen/DOM context could exceed Haiku's window — that alone can disqualify the cheap path for exactly the tasks UIPE cares about. Test with a realistically-sized task, not a toy.
- Prompt caching matters here: Opus's plan output becomes Haiku's input. Cache the shared plan/spec prefix so the implement phase reads it at ~0.1× (source: prompt-caching guidance).
- Quality is the whole experiment. Cheaper-but-fails is not a saving. Use a *fresh-context verifier* (separate Opus call, or the rubric) to grade Haiku's output — don't let Haiku self-grade.

## Existing players / prior art
- **Kilo plan/implement split** — frontier plans, cheaper model implements; 59% cost cut at equal acceptance — the brief's anchor (source: briefs/2026-06-15.md).
- **LangGraph plan-and-execute** — planner LLM emits a multi-step plan, executor runs each step, replanner adjusts. The reference architecture for this split.
- **RouteLLM (lm-sys)** — routes each query to strong vs weak model by predicted difficulty; the "bank the spread" framing, but per-query rather than per-phase.

## Concrete next steps for Dirk
1. **Pick one real UIPE task** with a written acceptance rubric (the kind Opus would pass). Realistic context size — not a toy.
2. **Run path A (control):** Opus 4.8 plans *and* implements. Log `usage` (input/output/cache tokens) and rubric pass/fail. This is your baseline cost + quality.
3. **Run path B (split):** Opus 4.8 plans → Haiku 4.5 implements against that plan (cache the plan as the shared prefix). Log the same. Verify Haiku's output against the *identical* rubric via a fresh Opus verifier.
4. **Compute the delta:** dollars saved AND quality held. A pass only counts if path B clears the same bar as path A.
5. **Decide on the MCP** only if B passes: package the planner→implementer→verifier loop as the routing MCP. If B fails or hits the 200K cliff, the sharper product is *"route only tasks under N tokens; fall back to Opus above"* — sell the router's judgment, not blind downgrade.

## Open questions
- Does Haiku 4.5 actually pass a real UIPE rubric, or just produce plausible-looking output? (The entire experiment.)
- What fraction of real UIPE tasks fit under Haiku's 200K window?
- Is Sonnet 4.6 ($3/$15) the better implementer floor — 40% cheaper than Opus, far more capable than Haiku — making it the real arbitrage tier?
