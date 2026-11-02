---
date: 2026-11-02
classification: research
action: Check how m3.sineframe.com/leaderboard's overlap-vs-no-overlap split behaves for a browser/temporal server — the failure mode UIPE must beat to get called at all.
source_brief: briefs/2026-11-02.md
---

## TL;DR
M3's leaderboard measures one thing: did the agent actually *call* your MCP server, or answer from memory / its own built-in tool. The whole story is a single split — servers whose job **overlaps a built-in** tool (web search, files, shell, memory) collapse to 17–66%; servers with **no overlap** score 92–96% across all three agents. Both browser servers on the board sit in the no-overlap tier and land within 4.1 points of each other (Claude Code 93.5 / OpenCode 96.2 / Codex 92.1 for the whole group). **The good news for UIPE: a browser/UI-perception server has no built-in to overlap, so it starts in the safe tier.** The failure mode to beat is not "browser" — it's letting the task be answerable *from memory* (the Memory-server trap), where Claude Code skipped the server and read its own notes file instead.

## Key findings
- Overlap is the entire axis. No-overlap group (Postgres, Mongo, Redis, Kafka, Linear, Jenkins, Grafana, K8s, Gitea, **2 browser servers**): 93.5/96.2/92.1%. Overlap group (Exa, Fetch, MS Learn, DeepWiki, Terraform, Git, Filesystem, Desktop Commander, Serena, Memory): 34.5/66.3/17.2%. (source: https://m3.sineframe.com/blog/same-model-different-agent.md)
- Browser = no overlap = safe. No coding agent ships a built-in browser tool, so the agent has no alternative — that's *why* both browser servers scored in the low-90s. This is the tier UIPE wants to be in. (source: same)
- A right answer from the wrong place scores as a *miss*. Scoring asks "did the key value appear in a server response?" — not "was the answer correct." Claude Code got 342/378 overlap-tier answers right *without* calling the server. (source: same)
- The real UIPE risk is "answer from memory," not a rival browser MCP. On the Memory server Claude Code opened its own MEMORY.md instead of calling the tool. If a UIPE task ("what state is the UI in?") can be *reasoned about* rather than *observed*, the agent will guess and skip the server. (source: same)
- Score is agent-dependent, so pin the agent. Same server/model/task scored 96% (OpenCode) vs 11% (Codex) on Exa. Codex skipped the server on 44.5% of should-call trials; OpenCode 16.1%. (source: same)
- Methodology to copy: ~20 tasks/server in 7 shapes incl. "collisions with built-in tools" and "server shouldn't be called"; fixtures seeded with random per-trial values so memory can't win; 3 trials each. (source: https://m3.sineframe.com/llms.txt)

## Existing players / prior art
- SineFrame M3 — open-source pytest gate that runs real Claude Code/Codex/OpenCode/Pi against your MCP and fails when the agent didn't call it — https://github.com/sineframe/m3
- MCP Agent Usability leaderboard — 21 servers, 3,717 trials, per-server pages + ignore rate — https://m3.sineframe.com/leaderboard/
- MCPJam — competing MCP tester (OAuth/cross-client), weaker on agent-behavior CI gating — https://m3.sineframe.com/compare/mcpjam.md

## Concrete next steps for Dirk
1. Install M3 (`pip`/pytest) and point it at UIPE locally. Write 3 task shapes first: a lookup, a "collision with built-in" task, and a "should-not-call" task — that trio exposes the memory-skip failure fastest.
2. Run UIPE through **both Claude Code and Codex** (not just one). The split is agent-specific; a single green column is a false positive.
3. Watch the **ignore rate**, not just success. Low success + high ignore = the agent never asked (fix the tool description/trigger). Low success + low ignore = it asked and UIPE broke.
4. Harden tool descriptions against "reason from memory": make the task require a *freshly observed* value (random per-trial UI state) that cannot be inferred — this is how M3's fixtures force the call, and how UIPE proves it must be called.

## Open questions
- Exact per-server numbers + ignore rate for the two browser servers (lazy-loaded data chunk; not in the static bundle — read live at /leaderboard/#/server/<slug> in a real browser).
- Which two browser servers are on the board (likely Playwright + a cloud browser like Browserbase/Steel) — matters for who UIPE is benchmarked against.
- Is there a "temporal/over-time perception" task shape at all, or would UIPE need to author its own category?
