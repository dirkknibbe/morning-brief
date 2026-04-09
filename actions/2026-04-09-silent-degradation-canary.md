---
date: 2026-04-09
classification: build-plan
action: Spin up Silent-Degradation Canary — 5 fixed prompts × 4 providers, daily run, public page
source_brief: briefs/2026-04-09.md
---

## TL;DR
The wedge is real but crowded: artificialanalysis.ai, llm-stats.com, and simonw's llm-bench already publish daily-ish provider comparisons. None of them frame it as *silent degradation* — they're leaderboards, not canaries. That framing is the only defensible moat, so the v0 must lean hard into "did today's GPT-5 get dumber than yesterday's?" with diffable outputs and a visible delta feed, not a score table. Build it as a single GitHub Actions cron + static site in a day, ship to a subdomain, post the link in the r/ClaudeAI/r/LocalLLaMA threads where the 2,759 upvotes live. Do **not** build a SaaS — this is a credibility asset, not a product.

## Key findings (from prior knowledge — fetch tooling broken this session)
- **artificialanalysis.ai** runs continuous benchmarks across ~30 models but reports aggregate quality/price/speed, no per-prompt diffs.
- **llm-stats.com** and **openrouter.ai/rankings** publish snapshots; neither surfaces *regression events*.
- **simonw/llm** + `llm-bench` shows the one-file pattern works: a YAML of prompts, run via CLI, dump JSON.
- **OpenAI Evals** and **promptfoo** are the obvious eval frameworks; promptfoo has built-in multi-provider + HTML report and is probably the fastest path to v0.
- The Reddit pain point is qualitative ("feels dumber this week"), so the canary's job is to *prove or disprove the vibe* with a diff, not to produce another leaderboard number.

## Existing players / prior art
- artificialanalysis.ai — continuous multi-provider leaderboard — https://artificialanalysis.ai
- llm-stats.com — snapshot comparisons — https://llm-stats.com
- promptfoo — OSS eval framework w/ HTML report — https://github.com/promptfoo/promptfoo
- simonw/llm-bench — minimal CLI eval pattern — https://github.com/simonw/llm-bench
- OpenRouter rankings — provider usage leaderboard — https://openrouter.ai/rankings

## Concrete next steps for Dirk
1. **Pick 5 prompts that expose regression, not capability.** Candidates: a tricky multi-step arithmetic, a subtle instruction-following trap, a long-context recall needle, a refusal-calibration probe, a code-edit with a one-line subtle bug. These must have *stable, checkable* expected outputs so diffs are meaningful.
2. **Use promptfoo, not from scratch.** `promptfoo eval -c canary.yaml --output results/$(date -I).json` in a GitHub Action on a daily cron. Commit results to the repo — the git history *is* the canary.
3. **Static site = `index.html` that reads the last 30 JSONs and renders a grid of ✅/⚠️/❌ per (prompt, provider, day), with click-to-diff against yesterday's raw output.** Deploy via GitHub Pages. Zero backend.
4. **Providers:** OpenAI (gpt-5), Anthropic (claude-opus-4-6), Google (gemini-2.5-pro), and one OSS via OpenRouter (llama-4 or deepseek). Budget: ~$0.50/day at current prices.
5. **Distribution:** after 7 days of data (so the first regression event has a chance to land), post to the same r/ClaudeAI thread with "I built this because of your post." Do not launch-post on day 0 — an empty canary has no credibility.
6. **First PR scope:** repo skeleton + `canary.yaml` with 5 prompts + GH Actions workflow + stub `index.html`. Nothing else. Merge, then iterate.

## Risks
- **Prompt rot:** if prompts are too capability-heavy, every model passes every day → no signal. Bias toward brittle, deterministic checks.
- **Provider API key rotation** in CI — use GH Secrets, fail loud on 401.
- **Crowded space** — the only differentiator is the *framing*. If the landing page says "another LLM leaderboard" it's dead.

## Open questions
- Is the r/ClaudeAI 2,759-upvote thread still live / is the audience still hot on 2026-04-09, or has the narrative moved on? (Couldn't verify — fetch tooling blocked this session.)
- Does promptfoo's HTML report support historical diffs, or does that need a custom viewer? (Likely custom.)
