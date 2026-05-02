---
date: 2026-05-02
classification: build-plan
action: Spike a Claude Code spend governor — parse local JSONL session logs, sum tokens, alert past a threshold; potential $50/mo product.
source_brief: briefs/2026-05-02.md
---

## TL;DR
The JSONL schema is trivial to parse — every assistant message carries `message.usage` with input/output/cache tokens and `model`. **ccusage** (ryoppippi, viral, npm-distributed, family of 5 sibling tools incl. MCP + statusline) already owns the *reporting* niche but ships **zero realtime alerting and zero hard-cap enforcement**. The wedge is enforcement via Claude Code's `PreToolUse` / `UserPromptSubmit` hooks (exit 2 = block) — that's a *daemon-less* spend governor in ~50 lines, and ccusage has no equivalent. Build it as free OSS first; the paid SKU is team rollups + Slack alerts, not the solo CLI. **Don't quote $50/mo until you know whether ccusage ships enforcement next week** — they could trivially eat your free tier.

## Key findings
- JSONL schema is stable: each assistant turn has `message.usage.{input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens}` and `message.model`; lines also carry `sessionId`, `cwd`, `gitBranch`, `timestamp`. Files live at `~/.claude/projects/<cwd-slug>/<sessionId>.jsonl`. (source: local sample, `0754112f-…jsonl`)
- ccusage is the dominant prior art and is *purely retrospective*: daily/monthly/session/5-hour-block reports, multi-instance grouping, MCP server, statusline, JSON export, multi-provider companions (Codex, OpenCode, Amp, pi-agent). Bundle is tiny, distribution is npx. (source: https://github.com/ryoppippi/ccusage and its README at https://raw.githubusercontent.com/ryoppippi/ccusage/main/apps/ccusage/README.md)
- ccusage README contains zero matches for `alert|notify|threshold|cap|limit|kill|enforce|webhook|daemon|watch|tail` — confirmed gap, not just an oversight in the README. (source: same README, grep)
- Claude Code hooks support hard enforcement: `PreToolUse` and `UserPromptSubmit` block on exit code 2; `Stop` fires per-turn so you can update a rolling counter cheaply. JSON-input via stdin includes session context. (source: https://docs.claude.com/en/docs/claude-code/hooks)
- The brief's $6k `/loop` overnight burn + Anthropic's multi-day dashboard lag is the *catalyst* story, not just a one-off — it's the demoable pain. (source: briefs/2026-05-02.md)

## Existing players / prior art
- **ccusage** — viral CLI for usage *reporting*, no enforcement — https://github.com/ryoppippi/ccusage
- **@ccusage/mcp** — same data exposed as an MCP server; informational only — https://www.npmjs.com/package/@ccusage/mcp
- **@ccusage/codex / opencode / amp / pi** — per-provider variants; same reporting model
- **Anthropic Console dashboard** — official, lags multiple days, no per-session granularity (per brief)
- *No "spend governor / hard-cap / kill-switch" project surfaced in 2 GitHub searches.* This is the open lane.

## Concrete next steps for Dirk
1. **4-hour OSS spike (today/tomorrow)**: write `cc-governor` as a single Bun script wired as `PreToolUse` + `UserPromptSubmit` hook in `~/.claude/settings.json`. It reads `$CLAUDE_SESSION_ID`'s JSONL, sums `usage.*` × model pricing, and `exit 2` with a stderr msg if cumulative > cap. Config: `.claude/governor.json` → `{ sessionCapUSD, dailyCapUSD, hourlyCapUSD, modelOverrides }`. **Reuse ccusage's pricing JSON** (don't rebuild it — it's already maintained and the differentiator isn't pricing accuracy).
2. **Ship as `cc-governor` on GitHub** with a 90-second demo gif of an attempted runaway being blocked. Post to r/ClaudeAI and HN with the angle: *"ccusage tells you what you spent; cc-governor stops you from spending it."* Direct nod to ccusage = goodwill, not threat.
3. **Validate paid SKU before building it.** Add a Stripe waitlist on a one-pager for "Team governor: central log shipper + Slack/PagerDuty alerts + per-engineer caps + manager dashboard." Target the Uber-shaped buyer (per-dev caps across 100s of seats), not solos. Only build if waitlist > 30 in 14 days.
4. **Defensive watch**: subscribe to ccusage releases. If ryoppippi ships an `--enforce` mode, your free OSS tier evaporates — pivot immediately to the team layer. Set a 2-week schedule check.

## Open questions
- Will ccusage absorb hard-cap enforcement? (Trivial code surface for them; they have the audience.)
- Is "$6k overnight burn" a recurring story or 1–2 anecdotes? Needs more data points before sizing the market.
- Do hooks fire reliably enough mid-`/loop` to enforce caps, or does Claude Code batch tool calls in a way that lets you blow past the cap before the hook re-checks? (Test before promising hard caps.)
- Will Anthropic ship realtime usage in the official dashboard within ~1 quarter and collapse the category?
