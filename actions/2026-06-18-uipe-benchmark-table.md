---
date: 2026-06-18
classification: build-plan
action: Steal Browserless's benchmark format — instrument one UIPE flow vs a screenshot-based agent on the same task, capture time + tokens, make that table the homepage.
source_brief: briefs/2026-06-18.md
---

## TL;DR
Browserless's "single table" is **six tasks × six tools, time-only**, with ⭐️/⚠️/❌ markers — no token column. Their stated thesis ("accessibility-tree snapshot is more reliable than raw DOM or screenshots") *is* UIPE's thesis, so you're not stealing a format, you're proving a claim they only asserted. The winning move: copy the table shape but add the **token column they omit** — that's the axis where structured perception beats screenshots decisively (a screenshot resends ~1.3k image tokens *every step*; a structured snapshot is a few hundred text tokens). Scope it to **one task, one clean comparison**: UIPE+Claude vs Claude computer-use (screenshots), *same model*, so perception modality is the only variable. Don't build six benchmarks — build one harness that emits the table, then add rows later.

## Key findings
- Browserless's public table reports **wall-clock time only** (e.g. DemoQA form fill: 2m03s ⭐️ vs Browserbase 7m15s ⚠️). No tokens, no cost. That's your wedge. (source: https://www.browserless.io/blog/introducing-browserless-agent)
- Their agent loop is **snapshot → plan → act (ReAct)**, snapshot = "compact list of interactive elements with stable selectors… more reliable than raw DOM or screenshots." Same architecture UIPE should instrument against. (source: same)
- They credit speed to **command batching** (8-field form → 3 calls, not 10+) and **stateful sessions**, not to perception modality — so a token-axis comparison is unclaimed territory. (source: same)
- Benchmark harness is **env-var driven** (TOTAL runs/provider, URL target) and reports **Average / Fastest / Slowest**; report median + tail, not a single cherry-picked run. (source: https://www.browserless.io/blog/hosted-browser-benchmarking)
- Image-token math makes the case quantitative: Anthropic bills screenshots at ≈ (w×h)/750 tokens (~1.3k for 1280×800), resent each turn — a 15-step task can burn 20k+ vision tokens a text snapshot avoids entirely. (source: docs.anthropic.com computer-use token accounting)

## Existing players / prior art
- **Browserless Agent** — MCP-native, accessibility-tree snapshots, time-only benchmark — https://www.browserless.io/blog/introducing-browserless-agent
- **Browser Use** — "Speed Matters", ~3s/step, also frames the fight as speed not tokens — https://browser-use.com/posts/speed-matters
- **Holistic Agent Leaderboard** — methodology for *fair* agent eval (multiple runs, cost-aware) — https://arxiv.org/pdf/2510.11977
- **Claude computer-use** — the natural screenshot baseline; same model as UIPE isolates the variable.

## Concrete next steps for Dirk
1. **Pick the task: DemoQA complex form fill.** Already in Browserless's table (instant external anchor), deterministic/repeatable, and forms are where screenshots fail hardest — UIPE's strongest case.
2. **Pick the baseline: Claude computer-use (screenshots) vs UIPE+Claude.** Same model on both sides. Resist adding browser-use/Operator in PR #1 — different models muddy the "perception modality" claim.
3. **First PR = the harness, not the page.** A runner that executes both agents on the task N times and logs per run: `{ task, agent, wall_ms, input_tokens, output_tokens, image_tokens, steps, success }` to JSONL. Emit a markdown table (median time, median total tokens, success rate). Steal the ⭐️/⚠️/❌ legend verbatim.
4. **One row, then publish.** A single honest row (UIPE vs screenshots, time *and* tokens) beats a six-task grid you never finish. The homepage is the table; the table starts at one row.

## Open questions
- Does UIPE already expose token counts per step, or does the harness need to wrap the Anthropic SDK's `usage` to capture image vs text tokens separately?
- Apples-to-apples success criteria: who judges "task completed" — a DOM assertion or a screenshot diff? Pick a DOM assertion so the *baseline's* modality isn't the judge.
- Is the goal marketing (one dramatic row) or a defensible eval (CI-gated, multi-run)? That decides whether PR #1 optimizes for a screenshot or for reproducibility.
