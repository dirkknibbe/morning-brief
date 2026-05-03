---
date: 2026-05-03
classification: research
action: Read DeerFlow `.agent/` and `skills/` — closest OSS mirror of where UIPE wants to land. Compare to Archon's outer harness; locate the "sub-agent message gateway" seam UIPE would plug into.
source_brief: briefs/2026-05-03.md
---

## TL;DR
DeerFlow 2.0 (ByteDance, ~64k★) is a clean OSS reference for the harness shape UIPE is heading toward: a Gateway API + LangGraph runtime that spawns scoped sub-agents (each with its own tools, skills, model, sandbox, timeout). Archon is a different animal — its "outer harness" is an orchestrator that routes platform messages (Telegram/Slack/CLI/GitHub) into YAML DAG workflows that drive *coding* assistants (Claude Code, Codex). For UIPE specifically, DeerFlow's `subagents/` package + `.skill` archive format is the seam: UIPE phases map cleanly onto skills, the UIPE coordinator maps to a `custom_agents` entry. Archon is the better template for *multi-channel inbox + workflow DAG*; DeerFlow is the better template for *agent composition + sandboxed execution*. They're complementary, not competing.

## Key findings
- DeerFlow ships sub-agents as a first-class primitive in `backend/packages/harness/deerflow/subagents/` — `executor.py` runs each in an isolated persistent event loop and returns a `SubagentResult{task_id, trace_id, status, ai_messages}`; `registry.py` resolves config in 3 layers (builtins → `custom_agents` in config.yaml → per-agent overrides). (source: github.com/bytedance/deer-flow/tree/main/backend/packages/harness/deerflow/subagents)
- The "sub-agent message gateway" is the **Gateway API** (port 8001) — owns `/api/langgraph/*` paths, hosts the agent runtime, and is what IM channel workers + the embedded `DeerFlowClient` both call. LangGraph carries the lead↔sub-agent message routing under it. (source: README.md → "Gateway owns /api/langgraph/*")
- Skills are markdown SKILL.md modules with optional frontmatter (`version`, `author`, `compatibility`); loaded *progressively* per task to keep context lean; installable as `.skill` archives via the Gateway. Built-in: research, report-generation, slide-creation, web-page, image-generation. (source: github.com/bytedance/deer-flow/tree/main/skills/public)
- Sub-agents are configurable per call: `tools` (allowlist), `disallowed_tools`, `skills`, `model`, `max_turns`, `timeout_seconds`, `system_prompt`. Built-ins are `general-purpose` and `bash`. (source: subagents/registry.py)
- Archon's harness is platform-adapter-first: Adapters → Orchestrator (message routing + context) → {Command Handler, Workflow Executor, AI Assistant Clients} → SQLite/Postgres. Workflows are YAML DAGs with loop nodes. Different audience: deterministic *coding* automation. (source: github.com/coleam00/Archon README)

## Existing players / prior art
- **DeerFlow 2.0** — ByteDance super-agent harness, sub-agents + skills + sandbox, LangGraph-based — github.com/bytedance/deer-flow
- **Archon** — coding-focused harness builder with multi-platform orchestrator + YAML workflows — github.com/coleam00/Archon
- **MetaGPT, AutoGen** — earlier multi-agent frameworks; less of an outer-harness shape, more orchestration-of-roles
- **LangGraph** — the substrate DeerFlow runs on; worth pinning because UIPE will likely sit on a similar graph runtime if it grows

## Concrete next steps for Dirk
1. Clone deer-flow locally; read `backend/packages/harness/deerflow/subagents/{executor,registry,config}.py` end-to-end (~30 min). That's the seam doc — better than any blog post. Note especially the `SubagentResult` shape and the `_get_isolated_subagent_loop` pattern.
2. Pick one UIPE phase (e.g. the rules-engine pass) and prototype it as a SKILL.md following `skills/public/research/SKILL.md` as the template. Don't wire it up yet — just see if the workflow fits the markdown frontmatter contract.
3. Sketch UIPE's outer shape in 1 page: do you want Archon-style (platform-adapters → orchestrator → workflows) or DeerFlow-style (Gateway → LangGraph → subagents+skills)? UIPE's deterministic-pipeline nature points toward Archon's DAG, but its agentic-future points toward DeerFlow's subagents. Probably both, layered.

## Open questions
- How does DeerFlow's Gateway handle subagent *message back-pressure* and partial-failure (one of N parallel subagents times out)? Need to read `executor.py` past line 200.
- Does Archon's orchestrator expose a hook for "non-coding" workflows, or is the AI-assistant-client coupling load-bearing?
- Is there a shared standard emerging for `.skill` archives, or is DeerFlow's frontmatter format (`version`/`author`/`compatibility`) bespoke?
