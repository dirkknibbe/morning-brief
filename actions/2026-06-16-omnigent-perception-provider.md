---
date: 2026-06-16
classification: research
action: Read Omnigent's runner/server API; map UIPE's surface to its "uniform agent API" and test the "register as a perception provider = distribution" thesis.
source_brief: briefs/2026-06-16.md
---

## TL;DR
Omnigent's "uniform agent API" is a Responses-style HTTP surface (`/api/agents`, `/v1/conversations`, `/v1/sessions`) where the unit of extension is an **agent bundle** (tarball + `config.yaml` spec) — *not* a perception input. There is **no "perception provider" slot to register under**; the only third-party plug-in points are the **MCP proxy** ("proxies MCP tool calls with server-side policy enforcement"), **Skills**, and agent bundles. So the literal action ("register as a perception provider") isn't possible — but the *intent* is: ship UIPE as an **MCP server** and any Omnigent-hosted agent (Claude Code, Codex, custom) can call it, governed by Omnigent's policy layer. That is real distribution, and it's a half-day of work, not a rebuild. Do that; don't build a rival harness.

## Key findings
- The server exposes exactly four namespaces: agents, conversations, sessions, session-resources. Nothing about perception, providers, or plugins. (source: https://github.com/omnigent-ai/omnigent/blob/main/omnigent/server/API.md)
- Extension surface per the deploy docs: **MCP proxy & policies**, **Skills**, **Catalog** of agent specs. MCP is the *only* path for a third party to inject callable capability into someone else's agent. (source: https://omnigent.ai/docs/deploy/overview)
- `computer_call`, `image_generation_call`, `web_search_call` are listed under **"Not Yet"** — screen/UI perception is not yet a first-class item type. UIPE fills a gap Omnigent hasn't modeled. (source: API.md "Not Yet")
- The runner wraps an existing harness and "runs tools, streams events over WebSocket." UIPE-as-harness = becoming a competing runtime (wrong altitude). UIPE-as-MCP = a tool the existing harness calls (right altitude). (source: https://omnigent.ai/docs/deploy/overview)
- Per-session cost/policy/permission already enforced at the server (`cost_control_mode_override`, MCP policy ASK gates, elicitation approvals). UIPE's perception calls inherit that governance for free.

## Existing players / prior art
- Omnigent (Databricks, Apache 2.0) — meta-harness / control plane wrapping Claude Code, Codex, Pi. — github.com/omnigent-ai/omnigent
- MCP "computer use" / screenshot tools (Anthropic computer-use, various screen MCPs) — the category UIPE competes in *as a tool*, not as a harness.

## Concrete next steps for Dirk
1. **Scope a UIPE MCP server** exposing 2-3 tools: `perceive_screen()`, `get_ui_state()`, `assert_ui(expectation)`. This is the registration path — Omnigent's MCP proxy makes it callable + governed.
2. **Ship a reference agent bundle** (`config.yaml` wiring the UIPE MCP) so an Omnigent user gets a working "UI-aware agent" in one upload — distribution via the Catalog.
3. **Don't build a custom harness/runner.** That positions UIPE as a rival runtime and forfeits the distribution.
4. **Pre-empt the `computer_call` item type:** track that gap; if you define the perception-event shape before they do, UIPE becomes the de-facto reference.

## Open questions
- Does the MCP proxy support streaming/long-lived tool results? Perception is continuous, but the API models tool calls as discrete `function_call`/`function_call_output` — may force UIPE into a polling shape.
- Is there an auth/marketplace story for third-party MCP servers, or is registration per-deployment config only? (Auth is under "Not Yet" — likely self-hosted config today, which limits "distribution" to teams already running Omnigent.)
