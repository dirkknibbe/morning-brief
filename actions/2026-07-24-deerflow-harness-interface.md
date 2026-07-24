---
date: 2026-07-24
classification: research
action: Clone DeerFlow, read its `.agent/skills` + message-gateway layout — steal the interface, not the code.
source_brief: briefs/2026-07-24.md
---

## TL;DR
DeerFlow (bytedance/deer-flow, MIT, 77.8k★) is now a full "SuperAgent harness" — sandboxes, memory, subagents, skills, and a multi-channel message gateway. The brief's claim checks out exactly. **You don't need to clone it** — the entire interface worth stealing lives in three files I already read: `backend/app/channels/base.py`, `channels/message_bus.py`, and any `.agent/skills/*/SKILL.md`. The skill format is identical to the Anthropic/superpowers frontmatter you already use, so there's nothing new there. The real prize is the **channels/message-gateway pattern**: a `Channel(ABC)` adapter + an async `MessageBus` pub/sub + typed `Inbound/OutboundMessage` contracts. Port those contracts to TS (~1 file) and morning-brief's bespoke Telegram/Discord senders become uniform, testable, and inbound-capable. Skip the Python code entirely — it's a FastAPI/LangGraph monolith with OIDC, helm, and auth you don't want.

## Key findings
- **Message gateway = `channels/` dir, one file per platform** (telegram, discord, slack, feishu, dingtalk, wechat, wecom, github) over `base.py` + `message_bus.py` + `manager.py` + `store.py`. (source: api.github.com/repos/bytedance/deer-flow tree)
- **`Channel(ABC)`** holds `(name, bus, config)` and mandates `start()`, `stop()`, `send(OutboundMessage)`, optional `send_file()`, with a shared `_send_with_retry()` policy baked into the base. Adding a channel = subclass + implement 3 methods. (source: raw…/channels/base.py)
- **`MessageBus`** is an async pub/sub hub that *decouples channels from the agent dispatcher* — channels never call the agent directly. (source: raw…/channels/message_bus.py)
- **`InboundMessage`/`OutboundMessage`** are the load-bearing contract: `chat_id`, `user_id`, `thread_ts`, `connection_id`, `files[]`, `metadata`, and crucially **`topic_id`** — same `topic_id` reuses one thread; `None` = one-shot Q&A. This is exactly your IDEA_SLUG thread-routing formalized. (source: raw…/message_bus.py)
- **Skills are plain `SKILL.md`** with `name`/`description` YAML frontmatter — same shape as your `triggers/`. No new idea to steal here. (source: raw…/.agent/skills/deerflow-maintainer-orchestrator/SKILL.md)

## Existing players / prior art
- DeerFlow — the blueprint above; MIT — https://github.com/bytedance/deer-flow
- Your own `src/sources.ts` + Telegram/Discord senders — the thing to refactor toward the `Channel` shape.

## Concrete next steps for Dirk
1. **Don't clone.** Read the two files linked above (5 min) — they are the interface. Cloning 2,758 commits of Python buys nothing.
2. Draft a TS `Channel` interface + `InboundMessage`/`OutboundMessage` types in `src/channels/` mirroring DeerFlow's contract (borrow `topic_id`, `thread_ts`, `chat_id`, `metadata`). Reframe the current Telegram/Discord senders as `TelegramChannel implements Channel` / `DiscordChannel`.
3. Add a thin `MessageBus` only if/when you want **inbound** (reply-to-brief, "research this idea" from chat). Today morning-brief is outbound-only, so the bus is YAGNI until inbound is on the roadmap — note it, don't build it.

## Open questions
- Is inbound (chat → trigger a run) actually on the morning-brief roadmap? If never, the `MessageBus` half of the pattern is dead weight and only the `Channel` ABC + message contracts are worth porting.
