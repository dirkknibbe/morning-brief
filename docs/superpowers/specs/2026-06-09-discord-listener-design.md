# Discord listener migration — design spec

**Date designed:** 2026-06-09 (brainstormed + validated, two rounds) · **Implementation started:** 2026-06-10
**Status:** approved — Approach A (dumb daemon + ephemeral workers), Discord transport

## Why (context)

The Telegram listener was a hand-started, long-running interactive Claude session
(`triggers/listener.md`). Two failure modes killed it on 2026-06-09: it wasn't running
(nothing polled Telegram), and Telegram's Bot API allows exactly one `getUpdates`
consumer per token — interactive Claude sessions' telegram plugin permanently raced
the listener for messages (almost certainly what consumed the lost `/build`).

**Decisions:**
- **Dumb always-on daemon + ephemeral workers.** Of everything the listener does, only
  free-form Q&A needs an LLM. `/build`, `/abort`, `/factory-status` are deterministic
  shell-outs. A resident Claude session was the most expensive, least supervisable
  router for those — and it dies when the API does.
- **Discord over Telegram.** Multiple gateway connections per bot (the consumer-race
  bug class is structurally gone), native slash commands with typed params +
  autocomplete, channel routing, threads, buttons.

## Components

### 1. `scripts/discord-listener.ts` — bun daemon (discord.js gateway)

- Slash commands (guild-scoped):
  - `/build slug:<string>` — slug **autocompletes from Mongo ideas where status=queued**;
    on submit: validate slug against `^[a-z0-9-]+$` (reject anything else **before any
    shell-out** — this is the injection boundary), confirm idea exists+queued, then shell
    out to `scripts/start-factory.sh <slug>` (already proven; writes
    `/tmp/morning-brief-factory.pgid` for abort's group-kill).
  - `/abort` — shells to the `src/factory.ts` abort path. NOTE: `run-abort` **already
    finalizes the run doc with terminator** as of PR #8 (`6cbcd99`) — do not re-implement
    finalization; reader agent must confirm the exact subcommand contract.
  - `/factory-status` — `src/factory.ts lock-check` (+ whatever cheap status the current
    listener.md spec returns).
- **Access gate:** every interaction checked against `DISCORD_GUILD_ID`,
  `DISCORD_FACTORY_CHANNEL_ID`/`DISCORD_BRIEF_CHANNEL_ID`, and `DISCORD_ALLOWED_USER_ID`
  (all already in `.env`). Fail closed: unknown guild/channel/user → ephemeral refusal,
  log, no execution.
- **Backlog discard:** never execute a command interaction older than ~5 min
  (startup-replay guard; kills the stale-`/build` foot-gun). Discord interactions
  largely can't replay like Telegram updates, but the guard is cheap — keep it.
- **Resilience:** network/gateway errors → log + backoff-retry *inside* the process.
  Never `process.exit` on transient failure — launchd `KeepAlive` would thrash.
  Fatal-only exits: bad config (missing env), invalid token.
- **Logging:** `logs/listener-<YYYY-MM-DD>.log`, matching the per-day stem convention
  in `scripts/run-trigger.sh`.
- `--once` flag: validate env, connect gateway, log ready, disconnect, exit 0 — the
  smoke test.

### 2. UX (#factory, #brief)

- Build-started message in #factory carries an **[Abort] button** (same gate + same
  code path as `/abort`).
- Build heartbeats go to a **thread under the build-started message**. Factory
  heartbeats currently pipe to `bun run send` — the send backend (below) must support
  routing there with the interface unchanged.

### 3. `bun run send` → Discord backend

- **Contract is frozen:** reads message body from **stdin**, not argv
  (`printf '%s\n' "msg" | bun run send`). Call sites: scheduled-brief trigger,
  factory.md heartbeats. They must not change.
- Backend: bot REST post (reuse `DISCORD_BOT_TOKEN`) to `DISCORD_BRIEF_CHANNEL_ID`
  by default. Telegram sender stays in-tree during transition (`TELEGRAM_*` keys
  remain in `.env`) but `send` routes to Discord.

### 4. `scripts/launchd/com.dirkknibbe.morning-brief.listener.plist`

- `KeepAlive=true`, `RunAtLoad=true`, matching the 5 existing jobs' template style.
- **Gotcha (VFS, 2026-05-29):** `scripts/launchd/*.plist` are version-controlled
  templates; live jobs in `~/Library/LaunchAgents` have drifted before. Generate from
  the same template style — don't hand-write — and the install step must copy the
  template verbatim.
- Env: follow whatever pattern the existing 5 use (run-trigger.sh sources `.env` via
  `set -a; . ./.env`). Bun also auto-loads `.env` from cwd — reader to confirm which
  mechanism the plists rely on. **Never read `.env` raw into context; key names only.**

### 5. Command registration

- `scripts/discord-register-commands.ts` — idempotent guild-scoped registration
  (PUT overwrite) of the three slash commands. Run once at deploy; safe to re-run.

### 6. Free-form messages (v1: static)

- Non-command messages in allowed channels get a static reply listing the available
  commands. **LLM dispatch (`claude --print` + listener.md) is an explicitly deferred
  follow-up** — the only piece with real cost/safety surface. Mark it in code with a
  pointer to `triggers/listener.md`.
- Intents: free-form replies need MessageContent+GuildMessages; slash commands only
  need Guilds. Dirk enabled intents on the bot — implementation should degrade
  gracefully (log a warning, slash commands still work) if MessageContent is missing.

### 7. Tests

- Pure-function units (bun test): command parsing/validation, slug regex, backlog
  cutoff, allowlist gate, send-body framing. No network in units.
- `--once` smoke (live gateway connect) — run at deploy.
- Live smoke: `/factory-status` from Dirk's phone (only Dirk can do this).

## Constraints (project-wide)

- Bun, not pnpm: `bun add`, `bunx tsc --noEmit`, `bun test`.
- `.env` is never read raw (secrets); `set -a; . ./.env` pattern or Bun auto-load.
- Commits: NO Claude co-author trailer, conventional-commit style.
- PR targets `main`. `rehearsal` is a merge target only — never reset/FF from main.
- Immutability, early returns, small files (<800), named constants per global style.

## Out of scope

- Free-form LLM dispatch (deferred, see §6).
- Removing Telegram code paths (transition period; outbound Telegram still works).
- `run-trigger.sh` silent-failure hardening — separate PR (note: `claude --print`
  exits 0 even on API connection errors, so the fix must detect `API Error:` in
  output, not just propagate `$?`).

## Acceptance

1. `bunx tsc --noEmit` clean, `bun test` green.
2. `--once` smoke connects to the gateway with real env and exits 0.
3. Slash commands registered in the guild (visible to Dirk).
4. plist template committed; live install + `launchctl print` verification at cutover.
5. Dirk's phone smoke: `/factory-status` answers; lost `/build` re-issued by Dirk after.
