---
date: 2026-07-12
classification: build-plan
action: Clone OpenBenchmarks' "ground-truth-in, scores-out" pattern as a public UIPE temporal-web-perception benchmark
source_brief: briefs/2026-07-12.md
---

## TL;DR
OpenBenchmarks (OpenFunnel, YC F24) is a *cleanly cloneable* architecture: declarative YAML vendor specs → one generic runner → pluggable metric registry → LLM judge with a fully published audit trail → agent-consumable endpoints (`/api/...`, `llms.txt`, `openapi.json`, `.well-known/mcp.json`). The scaffolding ports to UIPE in a weekend. The catch is ground truth: their labels are cheap (an LLM judges relevance of returned companies), yours are **not** — temporal-web-perception accuracy needs a controlled fixture set of web state-transitions with known-correct events, which you must author by hand. Also: the browser-agent benchmark space is already crowded (Steel, Skyvern, WebArena). But they *all* measure task success, not perception accuracy — that narrow, unmeasured gap is the wedge. **Recommendation: build it, but build the fixture harness first and scope tiny (10–20 deterministic scenarios). Don't clone the whole runner before you've proven you can produce trustworthy ground truth.**

## Key findings
- The whole benchmark is ~10 files: `specs/<vendor>.yaml` (base URL, auth, request template, response paths, field map, cost), `generic_runner.py`, `metrics.py` (registry, Precision@K primary), `judge.py` (Pydantic verdict + majority vote + mock mode), `common.py`. Most vendors need **zero Python** — just a spec (source: github.com/openbenchmarks-labs/lookalikes README).
- Every cell publishes the *literal* HTTP request/response (auth redacted) + the *literal* judge prompt/response under `data/`, so any agent can re-run and re-score. Reproducibility-by-default is the trust mechanism, not a nicety (source: same README, "Reproducing a cell").
- Distribution is real: OpenFunnel ran 200 incognito Claude Code buyer flows; the benchmark got fetched in a large majority and usually *drove the final pick* over vendor GEO pages (source: Show HN text, hn.algolia.com story).
- Their moat is neutrality — they took *their own* product off the leaderboard to preserve trust. A UIPE-authored benchmark that ranks UIPE #1 will be discounted by skeptical agents unless the audit trail is airtight (source: Show HN "On Benching ourselves").
- Existing web-agent benchmarks measure end-to-end task *success* and are near-saturated (WebVoyager 97–98%, WebArena ~68–74%). None isolates *perception accuracy* — "did the agent correctly detect this DOM/visual state change at time T" (source: awesomeagents.ai leaderboard, skyvern.com Web Bench).

## Existing players / prior art
- **OpenBenchmarks** — the pattern to clone; GTM APIs today, "devtools + infra next" (they may enter your lane) — https://openbenchmarks.com
- **Steel.dev leaderboard** — public, open browser-agent leaderboard; closest structural competitor — https://leaderboard.steel.dev
- **Skyvern Web Bench** — 5,750 tasks / 452 sites, separates read vs write, measures infra perf — https://www.skyvern.com/blog/web-bench-a-new-way-to-compare-ai-browser-agents/
- **WebArena / WebVoyager** — academic task-success suites; saturated, not perception-specific.

## Concrete next steps for Dirk
1. **Ground truth first, not the runner.** Author 10–20 deterministic temporal fixtures — self-hosted pages where a state change (toast appears, spinner completes, price ticks, async list loads) fires at a known time. The label is a *fact*, not an LLM opinion. This is the actual hard problem; if you can't make it trustworthy, kill the project here.
2. **Port the skeleton.** Copy the spec→runner→metrics→judge shape. Swap Precision@K for a perception metric (event-detection precision/recall, latency-to-detect, false-positive rate). Keep the "publish literal request + judge call" audit trail.
3. **Bench UIPE + 2–3 rivals** (a Playwright baseline, Browserbase/Steel, one vision-LLM approach) on the fixtures. Ship the `scores-out` JSON + `llms.txt` + `.well-known/mcp.json` so agents can call it. Own "perception accuracy" as the category Steel/Skyvern don't measure.

## Open questions
- Can temporal ground truth be made *reproducible* by an outside agent, or does verifying a cell require running your fixture server? (OpenBenchmarks' replay model assumes stateless HTTP — temporal web state may not replay cleanly.)
- Is "perception accuracy" a metric buyers/agents actually select on, or only task success? Validate demand before building the full sweep.
