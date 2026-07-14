---
date: 2026-07-14
classification: research
action: Steal Sense's benchmark methodology (hand-built answer keys, pinned commits, mechanically verified citations) and design a "UIPE lifts agent UI-navigation recall by +X" benchmark.
source_brief: briefs/2026-07-14.md
---

## TL;DR
Sense's benchmark is fully open in [`bench/`](https://github.com/luuuc/sense/tree/main/bench) — you don't need to reverse-engineer it, you can port it almost verbatim. Its credibility comes from four moves: a **locked** scoring formula, **mechanically verified citations** against a **pinned commit**, a **frozen hand-graded held-out set** as the anti-Goodhart anchor (correlation ≥0.85 with human grades), and a **same-model baseline** (agent alone vs agent+tool). Steal all four for UIPE. The catch worth naming up front: Sense verifies `file:line` — cheap and deterministic. UIPE must verify UI references against a *rendered DOM*, which is non-deterministic (async, animation, auth state). Pinning commits helps but doesn't fully solve it. Build 3 hand-graded scenarios first and prove the grounding check works before scaling.

## Key findings
- **Fairness formula (the headline):** `0.10·keyword_coverage + 0.55·llm_quality + 0.15·citation_grounding + 0.20·efficiency`. Axes are *locked* — the tuning loop may reweight ±0.05/iter but cannot add/rename axes, so scores stay comparable across runs. (source: bench/SCORING.md)
- **Citation grounding = the anti-hallucination move.** Every `file:line` in the answer is verified against the repo at `run_meta.repo_commit`. EOF-overrun → `hallucinated`; missing path → `unresolved`. This is your "mechanically verified citations." (source: bench/SCORING.md)
- **Hand-built answer keys = the held-out set.** 3 frozen scenarios with hand-graded `gold.json` reference scores; the improvement loop never edits or re-runs them, only re-scores. Held-out correlation with human grades ≥0.85 is the pass bar. (source: bench/end-goal.md)
- **Structure:** 6 scenarios (1 per repo), 4 steps each, one agent session per `(tool, scenario)`. Same-model baseline vs baseline+Sense. Recall lifts are modest (blast-radius 0.17→0.25, find-callers 0.27→0.33); the "+0.48" is one cherry-picked scenario, not the aggregate. (source: bench/README.md, main README)
- **Anti-Goodhart scaffolding:** `audit_watchdog.py` flags suspect iterations, `convergence.py` is a 4-criteria stop, `lock_check.py` validates against `locked.yaml`. This machinery is what makes the number *believable*, not the number itself.

## Existing players / prior art
- **Sense (`luuuc/sense`)** — the template to port; MCP code-map, full open bench harness — https://github.com/luuuc/sense/tree/main/bench
- **WebArena / VisualWebArena** — existing agent UI-navigation benchmarks; use their task *shapes* but they lack Sense's grounding+held-out rigor — good citation foil.
- **LLM-as-judge harnesses (OpenAI evals, braintrust)** — reusable judge plumbing so you don't rebuild `judge.py`.

## Concrete next steps for Dirk
1. **Clone the harness mentally, not the code.** Copy `SCORING.md` + `end-goal.md` structure into a `uipe-bench/` design doc. Rename axes: `citation_grounding` → `selector_grounding`, `llm_quality` → `navigation_quality`. Keep the same weights to start.
2. **Define the UIPE grounding check first** — it's the hard part. Given an agent answer citing selectors/routes/roles, verify each exists in the rendered DOM of the app at a pinned commit (headless render → query). If you can't make this deterministic, the whole benchmark is soft. Prototype this on ONE app before anything else.
3. **Hand-build 3 held-out scenarios** on deterministic OSS web apps (pin commits): e.g. "list every path to checkout", "what elements mutate cart state", "blast radius of clicking Delete". Grade them by hand → `gold.json`. These anchor everything.
4. **Run same-model baseline** (agent with raw DOM+screenshot) vs agent+UIPE-map. Report recall lift the way Sense does — modest and honest beats a cherry-picked headline.

## Open questions
- Can DOM-state be pinned deterministically enough for `selector_grounding` to be mechanical, or does auth/async force a snapshot-based (frozen HTML) approach — and does a frozen snapshot still test *navigation*?
- Is "UI-navigation recall" even the right headline metric, or is efficiency (fewer clicks/screenshots to complete a task) the more defensible UIPE claim, mirroring Sense's real win (efficiency at same correctness, not big recall gains)?
