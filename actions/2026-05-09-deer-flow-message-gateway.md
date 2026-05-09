---
date: 2026-05-09
classification: research
action: read deer-flow's message_gateway source to understand the architectural shape MCPAASTA needs to compete with
source_brief: briefs/2026-05-09.md
---

## TL;DR
Deer-flow's "message gateway" is **not one component** — it's two cleanly-separated layers: an HTTP API gateway (`backend/app/gateway/`) and an IM message bus (`backend/app/channels/`). The bus itself is ~175 lines of textbook async pub/sub: one `asyncio.Queue` for inbound, a callback list for outbound, two protocol-agnostic dataclasses. There is no proprietary routing IP to "compete with." The real value is the **adapter ergonomics** (a 30-line `Channel` ABC + a 7-entry name→import-path registry) plus the dispatcher (`channels/manager.py`, 40k LOC) that maps `(chat_id, topic_id)` → LangGraph thread. MCPAASTA shouldn't reimplement this — it should slot in *as a channel/skill provider* and own a different layer (managed MCP infra).

## Key findings
- **MessageBus is trivially small.** `publish_inbound` puts on a queue; `publish_outbound` fans out to subscribers. No backpressure, no persistence, no priority. (source: `backend/app/channels/message_bus.py`)
- **Channel ABC is minimal.** Just `start/stop/send` + optional `send_file`/`receive_file`. Each adapter filters outbound by `msg.channel_name == self.name` — that's the entire routing logic. (source: `backend/app/channels/base.py`)
- **Lazy registry pattern.** `_CHANNEL_REGISTRY: dict[str, str]` maps `"slack" → "app.channels.slack:SlackChannel"`, resolved via `deerflow.reflection.resolve_class` at startup. Adding a channel = one registry entry + one file. (source: `backend/app/channels/service.py`)
- **The trio is decoupled by design.** Channels don't import LangGraph; the dispatcher doesn't import Slack/Feishu. The bus is the seam. This is the *only* architecturally interesting bit, and it's standard pub/sub. (source: `service.py` + `base.py`)
- **HTTP gateway is plain FastAPI.** Auth/CSRF middleware + 16 routers (agents, skills, threads, runs, mcp, memory, channels, etc.). Channel management exposed at `/api/channels`. (source: `backend/app/gateway/app.py`)
- **Topic-to-thread mapping** is the actual hard part — handled in `manager.py` (40k lines, skipped in 30-min skim). `InboundMessage.topic_id` is the threading key: same `topic_id` within a `chat_id` reuses a DeerFlow thread; `None` = one-shot Q&A. (source: `message_bus.py:48-52`)
- **Channels supported out of box:** Feishu, Slack, Telegram, Discord, DingTalk, WeChat, WeCom. Western + Chinese IM coverage in one harness. (source: `service.py:_CHANNEL_REGISTRY`)

## Existing players / prior art
- **bytedance/deer-flow** — 66k stars, LangGraph harness with channels+gateway+skills+subagents — github.com/bytedance/deer-flow
- **LangGraph (langchain-ai)** — the underlying agent runtime deer-flow wraps; deer-flow's gateway is a LangGraph-Platform-compatible API surface
- **AutoGen / MetaGPT** — meta-agent harnesses, but neither ships first-class IM channel integration
- **Slackbot frameworks (Bolt, slack-bolt-python)** — solve the channel side without the agent side
- **Cline / aider** — IDE-side; orthogonal to the IM-side wedge

## Concrete next steps for Dirk
1. **Drop the "compete with deer-flow's message gateway" frame.** It's ~250 LOC of standard async pub/sub. Not a moat, not a meaningful target. The brief's framing is wrong.
2. **Reposition MCPAASTA as a channel/skill provider that snaps INTO deer-flow** (and Bernstein, ruflo). The deer-flow `skills/` directory + `mcp` router are existing extension points — be the managed MCP backend they call out to. This is the GETadb.com shape: agent-friendly URL, no signup, `MCP-tool-as-a-service`.
3. **If the goal is a competing harness, the actual hard parts** are (a) topic→thread mapping in `manager.py` and (b) the IM-platform-specific message marshaling (each channel adapter is 10–53k lines — Feishu/WeChat are gnarly). The bus itself is a weekend.
4. **Steal the adapter pattern verbatim.** The `Channel` ABC + lazy registry + `MessageBus` is a clean idiom worth copying for any multi-source agent system (e.g. UIPE could expose itself as a deer-flow channel).

## Open questions
- How does `manager.py` actually map IM messages to LangGraph runs? (skipped due to 40k size; would take its own session)
- Does deer-flow's `skills/` directory follow Anthropic's skill format, or their own? (didn't check `skills/` dir)
- What's the upgrade path if you outgrow deer-flow's bus — Redis Streams? Kafka? (no obvious extension point in the current `MessageBus` class)
