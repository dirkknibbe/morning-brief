---
date: 2026-04-13
classification: build-plan
action: Estimate whether a cache-health MCP server is a weekend build, based on yesmem's keepalive pattern
source_brief: briefs/2026-04-13.md
---

## TL;DR

The cache TTL pain is real (502 HN points, 151 Reddit upvotes, GitHub issue #46829) but an MCP server is the wrong form factor. The root causes are (1) Anthropic's server-side TTL policy and (2) Claude Code busting its own cache key via git-status injection on every commit. An MCP server can't touch either. A monitoring dashboard is trivially buildable but solves the wrong problem. The community is already routing around the damage with env vars and keepalive pings — and pushing Anthropic to fix it upstream.

## Key findings

- Cache write is 12.5x more expensive than cache read. A 5-minute TTL means any coffee break triggers a full rewrite. (source: https://github.com/anthropics/claude-code/issues/46829)
- Boris (Anthropic, bcherny) says main agent still uses 1h cache, subagents use 5m. Users dispute this with receipts. (source: https://news.ycombinator.com/item?id=47740756)
- The deeper problem: Claude Code constructs 3 cache blocks — `{tools|version}`, `{system-prompt|claude.md|git-status}`, `{skills|./claude.md|user-prompt}`. Any git commit changes `git-status`, invalidating the second block regardless of TTL. (source: HN user g4cg54g54, https://news.ycombinator.com/item?id=47747209)
- Workaround already circulating: `CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS=1 claude "Hello"` — stops git-status from busting the cache. Reduces cache_write from 6k to 18-20 tokens per session. (source: same HN post)
- A Reddit user (papoode) shipped a keepalive ping into their tool — default 5 pings giving ~24min window. (source: https://www.reddit.com/r/ClaudeAI/comments/1sjxrp1/)
- API users can request `"ttl": "1h"` in requests, but Claude Code doesn't expose this for API-key users — only Bedrock has `ENABLE_PROMPT_CACHING_1H_BEDROCK`. (source: HN discussion)

## Existing players / prior art

- **Grov** (TonyStef/Grov, 185 stars) — team memory proxy, not cache-specific — https://github.com/TonyStef/Grov
- **papoode's tool** — keepalive ping baked into a Claude Code wrapper — partial GitHub URL: github.com/carstene...
- **g4cg54g54's env-var workaround** — zero-install fix for the git-status cache-bust — no repo, just HN post
- **yesmem** — referenced in brief as shipping keepalive ping feature; couldn't locate a public repo (may be a product, not OSS)

## Why the MCP framing is wrong

An MCP server runs *inside* a Claude Code session. It can expose tools and resources. But:

1. **It can't control cache TTL** — that's Anthropic's server-side policy.
2. **It can't prevent cache-key invalidation** — git-status injection happens in Claude Code's core, before MCP tools load.
3. **A keepalive ping needs to run *between* sessions or during idle** — MCP servers only execute when the agent calls a tool, so they can't fire on a timer.
4. **Monitoring cache_read vs cache_write** from inside a session requires parsing API response headers, which MCP servers don't have access to.

The only viable MCP angle: a server that wraps the Anthropic API as a proxy, intercepts responses, logs cache metrics, and sends keepalive pings on a timer. But that's a proxy server, not an MCP server — and Grov already occupies that niche.

## Concrete next steps for Dirk

1. **Don't build this.** The MCP form factor doesn't reach the problem. The community is already solving it with env vars and upstream pressure.
2. **Apply the workaround now**: set `CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS=1` or `includeGitInstructions=false` in settings.json. This is the highest-ROI move and takes 30 seconds.
3. **If you still want to ship something**: build an *effort canary* (yesterday's Opportunity Spark #3) instead — that's a legitimate MCP server use case because it can intercept tool calls and measure thinking-token allocation, which *is* observable from inside a session.

## Open questions

- Where exactly is yesmem's public repo? The brief references it as a product but no OSS repo surfaced — may be closed-source or very new.
- Will Anthropic fix the git-status cache-bust? Issue #47107 is open but no official response yet.
- Can API-key users request 1h TTL in Claude Code? Currently no env var for this outside Bedrock.
