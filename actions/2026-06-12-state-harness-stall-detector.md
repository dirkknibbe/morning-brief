---
date: 2026-06-12
classification: build-plan
action: pip install state-harness, wrap a 10-turn UIPE loop in GrowthRatioGuard, see if the spiral classifier fires on a real browser-retry loop — validating a hosted browser-agent stall detector.
source_brief: briefs/2026-06-12.md
---

## TL;DR
`state-harness` is real (PyPI 0.3.0, alpha) and `GrowthRatioGuard` exists exactly as the action describes. Its **Retry Storm** classifier — "low-variance repeated calls, tool failing, agent retrying identically" — *is* a browser-retry loop, so the experiment will almost certainly fire. **But the experiment validates the wrong thing.** Detection is already solved as a free `pip install`; the README itself says "this is a library, not a platform" and that it does *not* beat a naive budget cap on success rate — its only value is diagnostics. Run the 30-minute local test for the dopamine, but do **not** read a green result as validation for a *hosted* SaaS. The hard part isn't detection; it's distribution and willingness-to-pay, and the detector is already a dependency you can vendor for free.

## Key findings
- `state-harness` 0.3.0, Rust core + Python wheels, by Vishal Verma. `GrowthRatioGuard(token_budget, ratio_threshold, window, budget_gate)` + `FailureReport.from_guard()` work exactly as the action assumes. (source: https://pypi.org/pypi/state-harness/json)
- Catches 5 patterns incl. **Retry Storm = "tool failing, agent retrying identically"** — a literal browser-retry loop. Classifier firing is the *expected* outcome, not a discovery. (source: pypi description)
- Author's own caveats: "❌ does NOT replace a budget cap — a naive cap achieves comparable success rates"; "resolve rates statistically identical with or without monitoring." The product is **diagnostics**, not prevention. (source: pypi description)
- Nascent: 9 stars, 1 fork, repo created 2026-05-25, pushed today. Early enough to build on, unproven enough that "hosted version of this" has zero demand evidence yet. (source: GitHub API)
- `browser-use` 0.13 already ships native "recovery loops inspired by coding agents" — the browser-agent runtimes are absorbing stall-recovery themselves, shrinking the space for a bolt-on hosted detector. (source: github.com/browser-use/browser-use)

## Existing players / prior art
- **state-harness** — the detector itself, free OSS — https://github.com/vishal-dehurdle/state-harness
- **browser-use 0.13** — dominant OSS browser agent, now self-recovers — https://github.com/browser-use/browser-use
- **AgentOps / Langfuse / Helicone** — hosted agent observability already surface cost spikes & loops; a "stall detector" overlaps their roadmap.

## Concrete next steps for Dirk
1. **Run the cheap validation anyway** (~30 min, $0): `pip install state-harness`, wrap one real UIPE browser-retry loop, confirm Retry Storm fires + read the `FailureReport`. Treat it as "does the lib work for my use case," not "should I build a company."
2. **Kill the hosted-SaaS framing.** Detection is a free dependency. Do not scaffold a service.
3. **If the report is genuinely useful to you**, the sharper wedge is a thin OSS adapter that pipes `FailureReport` into a *specific* runtime (UIPE, or upstream into `browser-use`/Playwright-MCP) and surfaces it inline — ship/contribute it, don't host it. Distribution > detection.
4. **Defer "hosted" until you have one external user** who'd pay for diagnostics a budget cap can't give them. Until then it's a library, per the author.

## Open questions
- Does the Retry Storm classifier distinguish a *legit* retry (transient 503, will succeed) from a doomed loop, or does it false-positive on healthy retries? The "1,886 runs, zero FP" claim is on short/medium loops — untested on browser agents.
- Is UIPE's loop instrumented to emit per-turn `tokens_used`? If not, the integration cost is higher than `pip install` implies.
