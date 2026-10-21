---
date: 2026-10-21
classification: build-plan
action: Point Gauge CLI at UIPE's MCP server (free/local via npx+Docker+Claude sub) and read the first "agent got stuck" report.
source_brief: briefs/2026-10-21.md
---

## TL;DR
The action rests on a false premise. Gauge CLI (`@withgauge/cli`, gauge-sh, repo pushed **today**) is real, open-source (MIT), and does exactly what the brief said — run real coding agents against your product and capture where they get stuck. **But testing an MCP server is a hosted-only feature.** Local mode (the free, Docker-on-your-machine, use-your-Claude-sub path) supports only Skills, CLIs, SDKs, docs, and files — *not* authenticated MCPs. So "point it at UIPE's MCP, free and local" isn't possible as written. Two clean paths forward: (a) test UIPE's **Skill/CLI surface** locally for free today, or (b) use **hosted Gauge** (account + credits) for the actual MCP test. Don't burn an afternoon trying to make local MCP work — it's a product boundary, not a config problem.

## Key findings
- Gauge CLI is `@withgauge/cli`; install `npm install -g @withgauge/cli` then `gauge local runtime pull`. Needs Node 22.13+, Docker (Linux containers), and agent creds. Supports Claude Code, Codex, Pi, OpenCode via native login or API key. **No Gauge account required for local.** (source: https://raw.githubusercontent.com/gauge-sh/gauge-cli/main/README.md)
- **MCP testing is hosted-only.** README verbatim: "Local mode supports Skills, SDKs, CLIs, and files. Hosted compute adds support for docs, authenticated MCPs, and authenticated APIs." The Local/Hosted table confirms authenticated MCPs/APIs are hosted-tier. (source: same README)
- Hosted mode runs on Gauge-managed compute, auto-judges sessions, and uses **workspace credits** — i.e. not free, and needs `gauge onboard`. (source: same README)
- The loop is agent-driven: your coding agent authors evals, reads normalized transcripts, publishes structured "Findings" via `gauge run analysis save`; `gauge run insight` shows the evidence. In local mode YOUR agent does the analysis, not Gauge's. (source: same README)
- Brand confusion to ignore: `gauge.sh` still serves the OLD discontinued Gauge (Tach / code modularization). The AX tool lives at **withgauge.com** / `gauge-sh/gauge-cli` / docs.withgauge.com/agents. Don't trust gauge.sh. (source: https://gauge.sh, https://api.github.com/orgs/gauge-sh/repos)

## Existing players / prior art
- **Gauge (withgauge.com)** — AX hillclimbing: run agents against your tool, find friction, validate fixes — https://github.com/gauge-sh/gauge-cli
- **MCP Census** — 48.8k-server registry + `census_stats` over MCP; trust/provenance angle, not AX friction — (brief 2026-10-21)
- This is the "AX linter as a service" opportunity spark from today's brief — Gauge is local/BYO-agent; a hosted scorecard+badge is the $19/mo play adjacent to UIPE.

## Concrete next steps for Dirk
1. **Reframe the test (free, today):** does UIPE ship a Skill, CLI, or SDK surface? If yes, `gauge init --local` in that repo, write one eval describing a real UIPE task, `gauge run --local`, then `gauge instructions session-analysis --local`. That gives a genuine "where did the agent get stuck" report locally, no credits.
2. **If MCP specifically is the goal:** `gauge onboard` → `gauge init --hosted`, test the authenticated MCP there. Check credit cost first; cap the run to 1 sample.
3. **First PR-sized spike (15–30 min setup, assuming Docker already runs):** install CLI, `gauge local runtime pull`, `gauge init --local` in a throwaway UIPE checkout, run one eval against UIPE's CLI/Skill. Read the one finding. Decide if hosted MCP is worth the credits.

## Open questions
- Does UIPE expose anything beyond the MCP server (a CLI/SDK/Skill) that local Gauge can test for free?
- Hosted Gauge pricing — how many credits does one MCP session burn? (README says "credits"; no number found.)
- Can you wrap UIPE's MCP tool surface as a thin local CLI input to fake a free MCP-ish test? Unverified.
