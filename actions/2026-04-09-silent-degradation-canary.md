---
date: 2026-04-09
classification: build-plan
action: Build a silent-degradation-canary script that tests Claude API daily and alerts on quality drops, then open-source it as a lead magnet for a Model Canary SaaS
source_brief: briefs/2026-04-09-rerun.md
---

## TL;DR

The "LLM drift" problem is real and well-documented (Chen, Zaharia & Zou 2023 showed GPT-4 accuracy dropping 33 points between March-June 2023). But the monitoring space is already crowded: Braintrust ($80M Series B), Langfuse (acquired by ClickHouse), Helicone, and Artificial Analysis all cover quality tracking. A standalone canary script is a fine weekend project but a weak lead magnet — the people who'd use it already use one of these platforms. If you still want to ship it, scope it to a single TypeScript file, not a repo, and position it as a "poor man's eval" blog post rather than a SaaS wedge.

## Key findings

- **LLM drift is empirically proven.** The Stanford paper (Chen et al. 2023) documented GPT-4 dropping from 84% to 51% on prime-number identification in 3 months, partly due to reduced chain-of-thought compliance. This validated the widespread "GPT-4 is getting dumber" complaints. (source: https://arxiv.org/abs/2307.09009)
- **The monitoring market is saturated.** Braintrust ($80M B), Langfuse (25K GitHub stars, ClickHouse-acquired), and Helicone (5.2K stars) all offer production LLM observability with traces, evals, alerts, and dashboards. All have free tiers. (sources: braintrust.dev, langfuse.com, helicone.ai)
- **Artificial Analysis already does model-level benchmarking publicly.** They track intelligence scores, speed, and price across all major models with continuous updates — the exact "canary" function but at industry scale. (source: https://artificialanalysis.ai)
- **OpenAI Evals and RAGAS are the canonical open-source eval frameworks.** Any open-source canary would be compared against them immediately. (sources: github.com/openai/evals, github.com/explodinggradients/ragas)
- **Claude API pricing makes daily runs cheap but not free.** At ~$10/M tokens for Opus 4.6 and ~$6/M for Sonnet 4.6, 5 reasoning tests daily would cost pennies — but multiplied across models and users, it adds up fast for a SaaS.
- **The "lead magnet" theory is shaky.** Devs who care about model quality regression are already sophisticated enough to use Braintrust or Langfuse. A canary script would attract tire-kickers, not paying SaaS customers.

## Existing players / prior art

- **Braintrust** — Full eval + observability platform, $80M Series B — https://braintrust.dev
- **Langfuse** — Open-source LLM engineering platform, acquired by ClickHouse — https://langfuse.com
- **Helicone** — AI gateway + observability, YC-backed — https://helicone.ai
- **Artificial Analysis** — Public model benchmarking and comparison — https://artificialanalysis.ai
- **OpenAI Evals** — Open-source eval framework and benchmark registry — https://github.com/openai/evals
- **RAGAS** — Open-source LLM evaluation focused on RAG pipelines — https://github.com/explodinggradients/ragas
- **promptfoo** — OSS eval framework with multi-provider support + HTML reports — https://github.com/promptfoo/promptfoo

## Concrete next steps for Dirk

1. **Skip the repo, write a blog post instead.** A "How I monitor Claude for silent regressions" post with an embedded single-file TypeScript gist generates more leads than an empty GitHub repo. Cite the Stanford paper for credibility.
2. **If you still want to build it:** scope to one `canary.ts` file (~100 lines), 5 hardcoded reasoning prompts, a JSON log file (skip MongoDB for v0), and a Telegram alert. Ship it in this repo under `scripts/`, not as a separate repo. Total build time: 2-3 hours.
3. **For the SaaS angle:** differentiation would need to be *opinionated test suites per use case* (e.g. "medical reasoning canary", "code generation canary") rather than generic quality tracking. Validate demand by posting the blog to HN and measuring waitlist signups before writing any SaaS code.

## Open questions

- Do Anthropic's versioned model IDs (e.g. `claude-sonnet-4-20250514`) actually drift, or is drift only a problem with unversioned aliases? If versioned IDs are stable, the canary only matters at upgrade-decision time, not continuously.
- What 5 reasoning tests would be both stable enough to benchmark against and sensitive enough to detect 15% quality drops? The Stanford paper used math, code, and multi-hop QA — a good starting set.
- Is there a market for *provider-agnostic* canaries (test OpenAI + Anthropic + Google simultaneously) that none of the existing platforms serve well?
