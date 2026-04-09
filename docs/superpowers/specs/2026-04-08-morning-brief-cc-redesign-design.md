# Morning Brief — Claude Code Redesign

**Date:** 2026-04-08
**Status:** Approved design, ready for implementation planning
**Owner:** Dirk

## Context

`morning-brief` is a daily AI-powered research brief that scans the agent/AI
ecosystem (Hacker News, Reddit, GitHub) for business opportunities and delivers
it to Telegram. The original implementation (provided as `morning-brief-files.zip`)
is a standalone Bun/TypeScript script designed to be run via local cron.

This redesign ports the project onto Claude Code primitives — RemoteTrigger for
scheduling, WebFetch/WebSearch for deeper investigation, MongoDB for state,
and the `plugin:telegram` MCP for interactive follow-up queries — while keeping
the original code as a foundation.

## Goals

1. Unattended daily brief that runs without the laptop being on.
2. Richer synthesis: the agent actively investigates promising items via
   WebFetch instead of only seeing titles.
3. Cross-day awareness: dedupe repeat items and surface "this has been
   trending 3 days running" signals.
4. Interactive "dig deeper" queries from Telegram: DM the bot to drill into
   specific items from today's brief.
5. A browsable archive of past briefs in git.

## Non-goals (v1 YAGNI fence)

- X/Twitter integration
- Preferences feedback loop (`preferences` schema exists, write path deferred)
- Trend dashboards / charts
- Multi-user support
- Historical backfill of past briefs into mongo
- VPS for the interactive listener (local tmux only)
- Automatic theme taxonomy / normalization
- Retry logic beyond existing per-source `try/catch`
- CI/CD beyond the trigger's own git push

## Architecture

Two decoupled runtimes sharing a git repo and a MongoDB database:

```
┌─────────────────────────┐         ┌─────────────────────────┐
│  Scheduled brief        │         │  Interactive listener   │
│  (RemoteTrigger, 6:30am)│         │  (local tmux, always-on │
│                         │         │   when laptop is open)  │
│  - fetch sources        │         │                         │
│  - websearch/webfetch   │         │  - paired via           │
│    deeper investigation │         │    /telegram:access     │
│  - dedupe via mongo     │         │  - receives DMs         │
│  - synthesize           │         │  - reads today's brief  │
│  - commit brief to repo │         │    from repo            │
│  - send via bot API     │         │  - queries mongo        │
│  - update mongo state   │         │  - webfetch for depth   │
│                         │         │  - replies via plugin   │
└───────────┬─────────────┘         └───────────┬─────────────┘
            │                                   │
            ▼                                   ▼
   ┌────────────────────┐          ┌────────────────────────┐
   │  morning-brief     │          │  MongoDB Atlas         │
   │  (git repo)        │          │                        │
   │                    │          │  - seen_items          │
   │  - src/ (bun)      │          │  - signals             │
   │  - briefs/*.md     │          │  - preferences         │
   └────────────────────┘          └────────────────────────┘
```

The two runtimes are fully decoupled. The listener can die/restart without
affecting the schedule; the schedule can fail without breaking the listener.
Both read the same sources of truth.

## Components

The architecture leans into Claude Code primitives: a RemoteTrigger runs a
Claude Code **agent** with a prompt, and the agent itself orchestrates the
run using its tools (Bash, WebFetch, `mcp__mongodb__*`, etc.). Most
synthesis and orchestration logic lives in a prompt, not TypeScript.

Only the "mechanical" pieces — API fetching and Telegram delivery — stay as
Bun scripts the agent shells out to.

### `src/` — thin Bun utilities

- **`sources.ts`** — HN / Reddit / GitHub fetchers, ported from the original
  script. Extended so every `RawItem` carries a stable `id` (e.g.
  `hn:${objectID}`, `reddit:${post.id}`, `gh:${owner}/${repo}`) for mongo
  dedupe. Exposes a CLI: `bun run src/fetch.ts` prints `fetchAllSources()`
  output as JSON to stdout, so the agent can consume it via Bash.
- **`telegram.ts`** — Unchanged from the original. Bot API sender with
  4096-char chunking and plain-text markdown fallback. Exposes a CLI:
  `bun run src/telegram.ts < message.md` reads stdin and sends. A
  `--dry-run` flag prints instead of sending.

No `investigate.ts`, `synthesize.ts`, `db.ts`, or `repo.ts` modules — those
responsibilities live in the agent prompt and are executed directly via
Claude Code tools:

| Responsibility | How it's handled |
|---|---|
| Investigation (fetch URLs for depth) | Agent calls `WebFetch` directly |
| Synthesis (write the brief) | The agent IS Claude — writes the brief natively in its response, no SDK call |
| Mongo state | Agent uses `mcp__mongodb__find` / `insert-many` / `update-many` / `aggregate` |
| Git commit + push | Agent uses `Bash` with `git add && git commit && git push` |
| File writes | Agent uses `Write` tool for `briefs/<date>.md` |

### `triggers/scheduled-brief.md`

The prompt the RemoteTrigger loads. Tells the agent step-by-step what to
do on each run: fetch via the Bun CLI, dedupe via mongo MCP, investigate
via WebFetch, draft the brief, send via the telegram CLI, write + commit
the brief file, upsert signals. Includes concrete examples of tool calls
and the exact mongo collections / fields to touch.

This is the bulk of the "code" for the scheduled runtime. It's versioned
in the repo and edited like any other file.

### `triggers/listener.md`

A system prompt loaded into the local tmux Claude Code session. Instructs
the agent: "You are the morning-brief interactive listener. When a
Telegram message arrives via `plugin:telegram`, read `briefs/<today>.md`,
consult mongo, use WebFetch for depth, reply via `plugin:telegram:reply`."
Includes example queries and how to handle them.

### `package.json` scripts

- `bun run fetch` — runs `src/fetch.ts`, prints raw items JSON.
- `bun run fetch:pretty` — same, pretty-printed for human inspection.
- `bun run send` — runs `src/telegram.ts`, reads stdin, sends to Telegram.
- `bun run send:dry` — same with `--dry-run`, prints instead of sending.
- `bun run listener` — launches the local Claude Code session using
  `triggers/listener.md` as its system prompt (wrapper script documented
  in README).

## Data flow

### Scheduled run (6:30 AM)

Executed by the RemoteTrigger agent following `triggers/scheduled-brief.md`:

1. `Bash: bun run fetch` → ~40-60 items as JSON on stdout.
2. For each item, check `seen_items` via `mcp__mongodb__find`; batch
   `update-many` / `insert-many` to bump `last_seen` + `times_seen`
   (insert with `first_seen` if new). Annotate each item in-memory as
   `isNew` / `isReturning`.
3. Rank top ~10 by score + novelty; `WebFetch` each URL (sequential, cap
   15, skip failures).
4. `mcp__mongodb__find` on `signals` for last 7 days → trending themes
   context.
5. Agent drafts the brief markdown inline (using the enriched items and
   trending themes), plus a short themes list.
6. `Bash: echo "$BRIEF" | bun run send` → delivery.
7. `Write` → `briefs/<YYYY-MM-DD>.md`.
8. `Bash: git add briefs && git commit -m "brief: <date>" && git push`.
9. `mcp__mongodb__insert-many` into `signals` for today's themes.
10. On any unrecoverable failure, agent calls the telegram CLI with an
    error summary so Dirk sees it in the same chat.

### Interactive run (on-demand)

1. `plugin:telegram` surfaces a message with `chat_id`.
2. Listener reads `briefs/<today>.md` (plus the last 2–3 days for context).
3. Queries `seen_items` / `signals` as needed.
4. Optionally WebFetches for deeper dives.
5. Replies via `plugin:telegram:reply(chat_id, ...)`.

## MongoDB schema

```ts
// seen_items — dedupe + novelty scoring
{
  _id: string,           // "hn:12345678" | "reddit:abc123" | "gh:owner/repo"
  source: "hackernews" | "reddit" | "github",
  title: string,
  url: string,
  first_seen: Date,
  last_seen: Date,
  times_seen: number,
  last_score: number,
}

// signals — daily theme aggregation, for trend detection
{
  _id: ObjectId,
  date: string,          // "2026-04-08"
  theme: string,         // free-text, e.g. "MCP auth", "browser-use agents"
  mentions: number,      // count of items tagged with this theme today
  source_ids: string[],  // references into seen_items._id
}

// preferences — schema only in v1; populated in v1.1
{
  _id: ObjectId,
  theme: string,
  weight: number,        // +1 thumbs up, -1 thumbs down, decays over time
  updated_at: Date,
}
```

### Indexes

- `seen_items`: `{last_seen: -1}`, `{times_seen: -1}`
- `signals`: `{date: -1, theme: 1}` compound
- `preferences`: `{theme: 1}` unique

## Error handling

- Each stage of the scheduled flow is wrapped in `try/catch`.
- Per-source fetch failures do not fail the whole run (already the case via
  `Promise.allSettled` in the original `fetchAllSources`).
- On unrecoverable error, the trigger posts a short error summary via the
  bot API so Dirk sees the failure in the same Telegram chat.
- Listener errors are surfaced as plain-text replies in the triggering
  thread.

## Credentials

| Variable | Purpose | New? |
|---|---|---|
| `ANTHROPIC_API_KEY` | Synthesis | existing |
| `TELEGRAM_BOT_TOKEN` | Delivery | existing |
| `TELEGRAM_CHAT_ID` | Delivery target | existing |
| `MONGODB_URI` | State store | **new** (MongoDB Atlas free tier) |
| `GIT_PUSH_TOKEN` | Trigger pushes commits to the `morning-brief` repo | **new** (fine-grained PAT or deploy key) |
| `GITHUB_TOKEN` | Raises GitHub search rate limits (optional) | optional; can reuse `GIT_PUSH_TOKEN` |

Three new credentials total: Atlas URI, a GitHub PAT with push scope on the
`morning-brief` repo, and wiring all of the above into the RemoteTrigger env.

## Testing strategy

- **Unit tests** (Bun's built-in runner) for the only pure helpers we own:
  `splitMessage` in `telegram.ts` and the `id` computation helpers in
  `sources.ts`. That's it.
- **Manual CLI smoke tests:**
  - `bun run fetch:pretty` — confirms fetchers return data.
  - `echo "hello" | bun run send:dry` — confirms the telegram CLI wiring.
  - `echo "hello" | bun run send` — confirms real delivery end-to-end.
- **Agent dry run:** execute `triggers/scheduled-brief.md` manually in a
  local Claude Code session before registering the RemoteTrigger. Use a
  `morning-brief-staging` mongo database and a dedicated test branch for
  the git commits so a failed dry run doesn't pollute `main`.
- **Listener testing:** start the tmux session, DM the bot, verify replies.
- **Explicitly not tested:** no mocked HN/Reddit/GH responses, no e2e
  harness, no tests for the agent prompt itself. For a personal daily
  tool the maintenance cost outweighs the value.

## Success criteria for v1

1. RemoteTrigger fires at 6:30 AM. A brief lands in Telegram. A commit lands
   in the `morning-brief` repo.
2. Items seen on consecutive days are marked "returning" in the brief.
3. From a local tmux Claude Code session, DMing "dig deeper on item 3" from
   Telegram produces a substantive reply that references WebFetch'd content.

## Open questions

None at design time. Implementation may surface decisions around:

- Exact ranking formula for the "top 10 to investigate" selection.
- How aggressively to dedupe (hide returning items? tag them? mention in
  a dedicated "still trending" subsection?).
- WebFetch timeout + concurrency tuning once real latency is observed.

These are implementation-time choices, not design-blocking.
