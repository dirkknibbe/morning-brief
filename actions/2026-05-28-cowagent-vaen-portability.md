---
date: 2026-05-28
classification: research
action: Read CowAgent's architecture and VAEN's portable-harness format; note where their abstractions leak (UIPE temporal/state portability)
source_brief: briefs/2026-05-28-rerun.md
---

## TL;DR
VAEN packages a harness's *config* (instructions + skills + MCP servers) as a tar `.agent` file, with env vars referenced by name only — a clean security primitive but it stops at static setup. CowAgent ships a full runtime with a three-tier memory hierarchy (context → daily → core) plus "Deep Dream" distillation, but exposes no export format for that memory. Neither solves the actual UIPE problem: portable *temporal* state — i.e., serializing a running agent's mid-task context (open tool calls, partial reasoning, time-windowed memory) so it can resume on another runtime. UIPE's wedge is the gap between "portable setup" (VAEN) and "rich in-process memory" (CowAgent). Read both for 30 min as planned; do not try to extend either — design the checkpoint format yourself.

## Key findings
- VAEN's `.agent` is a tar archive built from `agent.yaml`: `instructions.main + includes`, `artifacts[]` (only `skills` supported today), `requiredVars[]` (names only), `mcp.servers[]` (stdio/http transport, header env_var indirection). Source: github.com/sjhalani7/vaen
- VAEN explicitly forbids embedding secret values — `OPENAI_API_KEY=sk-...` in the manifest is invalid; only the env-var name travels. Receivers must re-provision secrets on import. (sjhalani7/vaen README)
- VAEN currently only supports one artifact type (`skills`). No memory artifact, no conversation history, no checkpoint type. (same)
- CowAgent (zhayujie/chatgpt-on-wechat, ~44k★, rebranded harness) advertises: Planning, Memory (3-tier + Deep Dream), Knowledge (auto-curated MD wiki + graph), Skills (Skill Hub/GitHub/ClawHub install), Tools (file I/O, terminal, browser, scheduler, native MCP), Channels (Web/WeChat/Feishu/DingTalk/WeCom/QQ/Telegram), multimodal, swappable models. Source: github.com/zhayujie/chatgpt-on-wechat README
- CowAgent's "Agent Core" is the integration point — every layer is described as independently extensible, but the memory tiers (context/daily/core) are CowAgent-internal; there is no documented serialization or import format equivalent to VAEN's `.agent`. (same)
- HN reception for VAEN was small (8 points, 3 comments as of fetch) — the primitive is interesting but the market has not validated demand for portable-harness packaging. (HN story 48300485)

## Existing players / prior art
- VAEN — yaml→tar harness packaging CLI — github.com/sjhalani7/vaen
- CowAgent / chatgpt-on-wechat — Chinese-ecosystem super-harness — github.com/zhayujie/chatgpt-on-wechat
- mattpocock/skills — VAEN's reference public bundles (engineering/productivity/misc) ship as `.agent` archives
- Claude Code skills — closest spiritual cousin to VAEN's "skills" artifact, but no portable container format
- LangGraph/Pydantic AI state checkpointers — solve in-process state persistence but are framework-locked

## Where the abstractions leak (the UIPE-relevant part)
1. **VAEN snapshots config, not runtime.** `.agent` is a frozen setup, not a live agent. There is no way to package "this agent, mid-task, with these 14 open tool calls and this memory state."
2. **CowAgent's memory tiers are not portable.** The 3-tier hierarchy is a runtime *structure*, not an *interchange format*. Deep Dream distillation is automatic, vendor-internal, and undocumented as an export.
3. **Both punt on temporal semantics.** Neither tags state by time horizon (volatile / session / durable / archival). VAEN treats everything as durable config. CowAgent's tiering hints at horizon but doesn't expose it externally.
4. **VAEN's env-var-name-only model is the right safety floor** — UIPE should copy this. But it implies harness portability requires an out-of-band secret-provisioning protocol, which neither project addresses.
5. **CowAgent's Channels coupling.** Per-channel context (WeChat thread, Telegram chat) makes cross-channel state migration hard — a cautionary tale for UIPE: bind state to *identity*, not to *channel*.

## Concrete next steps for Dirk
1. Spend the 30 min as planned: skim VAEN's `agent.yaml` schema and CowAgent's README architecture section. Don't fork either.
2. Draft a one-page UIPE doc: *Portable Agent Checkpoint* — fields for `setup` (VAEN-shaped), `memory[]` tagged with `horizon: volatile|session|durable|archival`, and `inflight` (tool-call queue + partial outputs). Write to `docs/plans/2026-05-28-uipe-checkpoint-format.md` if you want to follow up tomorrow.
3. Watch VAEN's `artifacts` extension points — if they add a `memory` or `state` type before UIPE ships, the wedge narrows. Set a re-check in 4-6 weeks.

## Open questions
- Does CowAgent expose any state-export API not surfaced in the public README? (Chinese-language docs may have more.)
- Is there a standards body (MCP working group?) discussing portable agent state, or is this whitespace?
- What's the smallest demo that would prove the UIPE checkpoint format — single-tool resume, or full multi-agent fan-out?
