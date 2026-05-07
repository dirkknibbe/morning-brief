---
date: 2026-05-07
classification: research
action: Read deer-flow 2.0 + arden.sh; decide whether UIPE is a perception lens inside Arden, or a standalone audit layer.
source_brief: briefs/2026-05-07.md
---

## TL;DR
Position UIPE as a **standalone audit/observability layer**, not as a sub-feature of Arden. Arden governs *intent* at the tool-call boundary (allow/block/HITL, Python-only); UIPE governs *effect* at the UI/DOM boundary (did the click land on the element it thought it did, did the page actually change, did a hallucinated `<RootSystemPrompt>` appear). They sit at different abstraction layers and run in different runtimes — collapsing them throws away UIPE's distribution surface (MCP works in any harness, not just LangChain/CrewAI/OpenAI SDK). Build UIPE so Arden is a *customer*, not a parent. Deer-flow 2.0's "skills + sandboxed sub-agents + Gateway" architecture is the cleanest place for an MCP-based perception lens to slot in.

## Key findings
- Arden is Python-monkeypatch governance: `arden.configure()` auto-patches LangChain / CrewAI / OpenAI Agents SDK and intercepts every tool call for allow/block/HITL/audit. Free 10k actions/month. (source: https://arden.sh)
- Arden's wedge is the *tool call boundary* — what the agent *intended* to do — and cost/token visibility. It does not perceive the resulting UI/DOM state. (source: https://arden.sh)
- Deer-flow 2.0 is a "super agent harness" with skills (Markdown SKILL.md files), MCP-based tools, isolated sub-agent contexts, sandboxed FS, and a Gateway API. Skills are progressive-loaded. (source: https://github.com/bytedance/deer-flow)
- Deer-flow's tool surface is explicitly MCP-pluggable — that's the integration shape UIPE already has. No Python-framework lock-in. (source: https://raw.githubusercontent.com/bytedance/deer-flow/main/README.md)
- The brief's own hot signals (vibe-coding debt, GEO injection of `<RootSystemPrompt>` into pricing pages/Food Lion flyers) point to *post-action perception* as the gap — proving what really rendered, not what was logged. (source: briefs/2026-05-07.md)
- Storybloq + Arden already crowd the *intent governance* lane. The *effect/perception* lane is open. (source: briefs/2026-05-07.md, line 17–18)

## Existing players / prior art
- arden.sh — Python tool-call interceptor; allow/block/HITL/audit at the call boundary — https://arden.sh
- bytedance/deer-flow 2.0 — open-source super-agent harness w/ skills + MCP tools — https://github.com/bytedance/deer-flow
- Storybloq — git-tracked project memory + governance for Claude Code (intent layer, not effect) — referenced in brief
- microsoft/playwright-mcp — DOM/UI MCP, but generic browser-control, no audit/provenance lens — adjacent

## Concrete next steps for Dirk
1. **Stay standalone, MCP-first.** Don't fork ardenpy; don't write a Python adapter as the v1 surface. Keep UIPE shipping as an MCP so deer-flow, Claude Code, Cursor, Codex, etc. can all plug it in unchanged.
2. **Frame UIPE as "Effect Audit."** One-liner for the README: "Arden audits what the agent *tried* to do. UIPE audits what *actually happened* on screen." Two layers, both needed. Make it cite-able.
3. **Build the killer differentiator: visual provenance record.** Per session: timestamped (action_intent → DOM-before → DOM-after → screenshot diff → hallucinated-element flag). Sell this as the artifact Arden's HITL reviewers and post-incident debuggers actually need.
4. **Ship a 1-day Arden interop demo** — a Python helper (`uipe.verify_action(call)`) callable from inside an Arden policy as a `review` escalation. Don't make it the product; make it the proof that the layers compose.
5. **Read the deer-flow `Skill.md` format** and ship a `uipe-perception` skill at `skills/public/uipe-perception/SKILL.md` — that's the cheapest distribution into a 65k-star harness.
6. **Skip Python-monkeypatch governance entirely.** It's Arden's moat and you'd be paying maintenance tax to compete on their lane instead of yours.

## Open questions
- Does Arden's policy DSL expose a way to call out to an external service (e.g. UIPE) inline during a `review` decision, or only via Slack/dashboard? If yes, the interop story is shorter.
- Deer-flow's sub-agent sandboxes are isolated — does the Gateway forward MCP servers to sub-agents, or only to the lead? (Affects whether UIPE-as-skill works at every level or just top.)
- Is "visual provenance record" a feature or a separate product? May be worth its own SKU once UIPE-MCP has adoption.
