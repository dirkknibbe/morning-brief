---
date: 2026-05-15
classification: research
action: Skim deer-flow's `message-gateway` module; if their inter-agent message bus matches UIPE's cross-agent perception channel, fork or learn from it before reinventing.
source_brief: briefs/2026-05-15.md
---

## TL;DR

deer-flow has no "inter-agent message bus." The thing called the **Gateway** is the HTTP/CSRF/auth front door (`backend/app/gateway/`), and the thing called **MessageBus** (`backend/app/channels/message_bus.py`) is a one-queue pub/sub between IM channels (Slack/Feishu/DingTalk/Discord/WeCom/Telegram/WeChat) and the LangGraph dispatcher. Sub-agent ↔ sub-agent communication happens inside LangGraph state, not on this bus. **Don't fork it for UIPE's cross-agent perception channel — the semantics are wrong.** But borrow the *shape*: typed `Inbound/OutboundMessage` dataclasses, a single asyncio.Queue + callback fan-out, channel-name routing. Implement UIPE's perception channel as its own primitive scoped to *agent observers*, not external I/O.

## Key findings

- **`MessageBus` is human-edge ingress, not agent-mesh.** Inbound = `(channel_name, chat_id, user_id, text, msg_type, topic_id, files, metadata)` from IM platforms; Outbound = dispatcher → channel callback. Single shared `asyncio.Queue` for inbound, list of `OutboundCallback`s for outbound. (source: https://raw.githubusercontent.com/bytedance/deer-flow/main/backend/app/channels/message_bus.py)
- **`ChannelManager` is the consumer side.** It pulls from the bus, calls the Gateway's LangGraph-compatible API over httpx with `assistant_id="lead_agent"`, CSRF cookies, and internal-auth headers. Per-channel streaming capability is a static map (`feishu`/`wecom` stream, others don't). (source: https://raw.githubusercontent.com/bytedance/deer-flow/main/backend/app/channels/manager.py)
- **Sub-agents don't use the bus.** Yesterday's dossier was right that sub-agents are spawned with isolated context and tools; today's read confirms inter-agent coordination is LangGraph graph-state + recursion (`DEFAULT_RUN_CONFIG["recursion_limit"] = 100`), not a separate broker. No "perception" primitive — sub-agents synthesize results back through state, not by observing each other live.
- **Topic-keyed thread reuse is the one clever idea.** `topic_id` within a `chat_id` reuses the same DeerFlow thread; `None` = one-shot Q&A per message. That's a tidy way to handle thread continuity without a stateful router, and the same pattern works for grouping perception events by *task* in UIPE.
- **The "gateway" name is overloaded across the repo.** `backend/app/gateway/` = HTTP API (port 8001, owns `/api/langgraph/*` + auth/csrf/authz). `Gateway` in the docs sometimes also means the unified nginx surface. The action's "message-gateway" most plausibly refers to `channels/` + `MessageBus`, but neither matches "inter-agent bus." (source: README §IM Channels)
- **Confirmation bias check.** Searched repo for `bus`, `gateway`, `router`, `broker`, `event`, `pubsub` in the backend tree. Only hits were the channels MessageBus and the HTTP Gateway. No agent-to-agent broker exists to fork.

## Existing players / prior art

- **deer-flow `MessageBus`** — IM-edge pub/sub. Right shape, wrong scope for UIPE. https://github.com/bytedance/deer-flow/blob/main/backend/app/channels/message_bus.py
- **LangGraph state** — what deer-flow actually uses for sub-agent coordination. Graph-shaped, not channel-shaped. https://langchain-ai.github.io/langgraph/
- **AutoGen GroupChat / GroupChatManager** — the closest OSS analog to "cross-agent perception": agents see a shared transcript with role-tagged turns. Worth a separate read if UIPE wants broadcast-style perception.
- **Anthropic MCP** — irrelevant here; MCP is tools, not agent-mesh.

## Concrete next steps for Dirk

1. **Don't fork `MessageBus`.** Vendor the *file* as a 200-line reference for the shape (dataclasses + queue + callback list), but write UIPE's perception channel as its own class with agent-mesh semantics: `(observer_agent_id, observed_agent_id, event_type, payload, task_id, t)`. The fan-out side wants *many subscribers per event*, not one-callback-per-channel.
2. **Steal the `topic_id` pattern**, rename it `task_id`, and use it to scope perception streams. Agents subscribing to a task get its events; cross-task isolation is automatic. This is the one design idea worth lifting verbatim.
3. **Decide the question yesterday's dossier left open: does UIPE want a bus at all, or graph state?** deer-flow chose graph state for sub-agents because sub-agent results are *synthesizable*. If UIPE perception is "observer reacts to observed in real time" (not "summarize at the end"), a bus is right. If it's "what did the other agent conclude," LangGraph-style state passing is simpler. Write 200 words on which UIPE needs before any code.
4. **Park the "claude-to-deerflow" idea.** Yesterday's open question on inbound deer-flow control is unrelated to perception; don't conflate.

## Open questions

- Does UIPE's perception channel need *replay* (catch up subscribers that joined late)? deer-flow's MessageBus doesn't — once an inbound message is consumed, it's gone. If UIPE needs replay, asyncio.Queue is the wrong primitive; consider an append-only log (e.g. a per-task list + condition variable, or Redis Streams if persistence matters).
- Is there a real-world UIPE scenario where two agents need to perceive each other *concurrently* (not one observing one)? That changes the fan-out math — Nx N subscriptions vs. 1xN. Worth sketching one concrete trace before designing the API.
