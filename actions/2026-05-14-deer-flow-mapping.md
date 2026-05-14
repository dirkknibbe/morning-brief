---
date: 2026-05-14
classification: research
action: Read bytedance/deer-flow's skills + subagents structure end-to-end; note bundled vs. exposed capabilities to find MCPAASTA wedge points.
source_brief: briefs/2026-05-14.md
---

## TL;DR

deer-flow 2.0 (67.6k★, 2,101 commits) is ByteDance's "Super Agent harness" on LangGraph: filesystem + memory + skills + sandbox + sub-agents + message gateway, batteries-included. It ships 21 bundled skills covering nearly every *creation* primitive (deep research, PPT, podcast, video, newsletter, frontend design, GitHub research, charts, paper review). Almost nothing in the harness handles **distribution** — `vercel-deploy-claimable` is the only outbound channel. That gap, plus the absence of identity-at-the-edge and event/cron triggers, is exactly where MCPAASTA fits. **Don't compete on creation skills — that battle is over inside this harness. Compete on the verbs deer-flow can't reach: post, send, schedule, route, meter, identify.**

## Key findings

- **Skills are Markdown files with frontmatter** (`name`, `description`, optional `version`/`author`/`compatibility`), loaded *progressively* only when needed. Two roots: `/mnt/skills/public/` (bundled) and `/mnt/skills/custom/` (user). `.skill` archives install via the Gateway. (source: README §Skills & Tools)
- **21 bundled skills**, all creation-oriented: academic-paper-review, bootstrap, chart-visualization, claude-to-deerflow, code-documentation, consulting-analysis, data-analysis, deep-research, find-skills, frontend-design, github-deep-research, image-generation, newsletter-generation, podcast-generation, ppt-generation, skill-creator, surprise-me, systematic-literature-review, vercel-deploy-claimable, video-generation, web-design-guidelines. (source: github.com/bytedance/deer-flow/tree/main/skills/public)
- **Sub-agents are spawned on the fly** by a lead agent with isolated context, scoped tools, and termination conditions; parallel when possible, results synthesized back. Token usage attributes to dispatcher. (source: README §Sub-Agents)
- **MCP is a first-class extension surface**: `extensions_config.json`, stdio+HTTP+SSE transports, OAuth (`client_credentials`/`refresh_token`), per-server custom Python *interceptors* for header injection/auth/metrics. Tools auto-registered at runtime, no code changes. (source: backend/docs/MCP_SERVER.md)
- **Core tool budget is small**: web search, web fetch, file ops, bash (sandboxed). Everything else is delegated to skills, MCP servers, or Python tool plugins. (source: README §Skills & Tools)
- **`claude-to-deerflow` skill** exposes a HTTP-spoken interface so Claude Code (or any external agent) drives a running deer-flow with `flash/standard/pro/ultra` execution modes. This is the opposite direction of MCPAASTA — *inbound* control of the harness, not *outbound* capability injection. (source: README §Claude Code Integration)

## Existing players / prior art

- **deer-flow itself** — most complete OSS harness with explicit skill/sub-agent/MCP surfaces. github.com/bytedance/deer-flow
- **LangGraph** (the substrate deer-flow sits on) — graph-runtime, not a harness. Distribution still DIY.
- **vercel-deploy-claimable skill** — the only distribution verb bundled. Tellingly narrow.
- **InfoQuest (BytePlus)** — newly integrated search/crawl toolset. ByteDance is pushing their own *input* primitives into the harness; nothing equivalent for output channels.

## Concrete next steps for Dirk

1. **Reframe MCPAASTA's pitch as "distribution-layer MCP for harnesses like deer-flow."** The harness wave is real and bundled creation skills are commoditized; the wedge is verbs that *move artifacts out* (post-to-LinkedIn, send-to-Substack, publish-to-Spotify, schedule-via-cron, route-replies-back). Pick one channel pair (e.g. podcast-host + email-newsletter) for the v0 demo so a deer-flow user can go "podcast-generation → MCPAASTA publish" in one run.
2. **Spike a `mcpaasta-publish` MCP server and drop it into deer-flow's `extensions_config.json`.** This is the fastest possible proof — no fork, no skill rewrite, just a server entry. If deer-flow's lead agent can orchestrate `podcast-generation` → `mcpaasta.publish_episode`, you've got a screencast.
3. **Audit MCPAASTA's identity story against deer-flow's OAuth-for-MCP-servers pattern.** Their model is "agent fetches a token to call a tool"; MCPAASTA's eventual model is "agent acts as the user on a third party." That delta — user-scoped tokens, not service tokens — is a defensible feature, but only if you can articulate it in the same `extensions_config.json` shape they already use.
4. **Write a 1-page "deer-flow + MCPAASTA" integration narrative** before any UIPE-distribution code. If the integration story doesn't read crisply on one page, the wedge isn't sharp enough yet.

## Open questions

- Does deer-flow's gateway support webhook/cron triggers, or are all runs user-initiated? README implies the latter but didn't confirm — if event triggers exist, "scheduled distribution" overlaps with their roadmap.
- How does the "message gateway" actually route between sub-agents vs. external IM channels? Could be a built-in distribution primitive I missed and didn't fully read.
- Is there public traction data on `claude-to-deerflow` adoption? If many people drive deer-flow from Claude Code, that's MCPAASTA's distribution channel too.
