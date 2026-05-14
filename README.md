# Morning Brief 🌅

A daily AI-powered research brief that scans the agent/AI ecosystem for business opportunities and delivers it to Telegram.

This is v2: the runtime is a Claude Code agent driven by the prompt in `triggers/scheduled-brief.md`. Thin Bun CLIs handle the mechanical bits (fetching, sending).

## Architecture

- **Scheduled brief** — a Claude Code RemoteTrigger fires at 6:30 AM daily, loads `triggers/scheduled-brief.md`, runs `bun run fetch`, dedupes via MongoDB, uses WebFetch for depth, drafts the brief, sends via `bun run send`, commits the brief file to this repo, and updates `signals`.
- **Interactive listener** — a local Claude Code session (run in tmux) loads `triggers/listener.md` and responds to Telegram DMs via the `plugin:telegram` MCP.

## Setup

### 1. Install

```bash
cd morning-brief
bun install
cp .env.example .env
# fill in the values
```

### 2. MongoDB Atlas (free tier)

- Create a cluster at https://cloud.mongodb.com
- Create database user, whitelist `0.0.0.0/0` (or the trigger runtime's IPs)
- Create database `morning-brief` with collections `seen_items`, `signals`, `preferences`
- Indexes:
  - `seen_items`: `{last_seen: -1}`, `{times_seen: -1}`
  - `signals`: compound `{date: -1, theme: 1}`
  - `preferences`: unique `{theme: 1}`
- Copy the SRV URI into `.env` as `MONGODB_URI`

### 3. Telegram bot

Use your existing bot or create one via [@BotFather](https://t.me/BotFather). Send your bot a message, then hit `https://api.telegram.org/bot<TOKEN>/getUpdates` to find your `chat_id`. Put both in `.env`.

### 4. GitHub push credentials

The scheduled trigger pushes a brief per day to this repo. Create a fine-grained PAT with `contents:write` scoped to this repo only. The RemoteTrigger needs it configured so `git push` works from the sandbox.

### 5. Scheduled trigger

Register a RemoteTrigger via the `schedule` skill:

- Cron: `30 6 * * *`
- Repo: this one
- Prompt: `triggers/scheduled-brief.md`
- Env: `MONGODB_URI`, `MONGODB_DB`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `GITHUB_TOKEN`

### 6. Local listener (tmux)

```bash
tmux new -s morning-brief-listener
cd morning-brief
# In the session, start Claude Code with triggers/listener.md as the system prompt
claude --system-prompt triggers/listener.md
# Ctrl-b d to detach
```

Pair your Telegram chat to the session via `/telegram:access`. DMs now route here.

### 7. Install git hooks (one-time per clone)

The repo ships a `pre-push` hook that rejects direct pushes to `main`, tag pushes, and force-pushes. Install it once per clone:

```bash
bash scripts/install-hooks.sh
```

The installer symlinks `scripts/hooks/pre-push` into the git hooks directory (shared across worktrees). Re-running is a no-op once installed.

Humans can bypass for a legitimate emergency with `git push --no-verify`. The factory agent cannot — `--no-verify` is in the `.claude/settings.json` deny list.

## Manual usage

```bash
bun run fetch:pretty                 # print raw fetched items
echo "test" | bun run send:dry       # test telegram wiring without sending
echo "hello" | bun run send          # actually send
bun test                             # run unit tests
```

## Cost

- Fetchers: free
- MongoDB Atlas free tier: free
- Scheduled Claude Code agent run: a few cents per day
- Local listener session: negligible when idle

## Customization

- Tune sources in `src/sources.ts` (`HN_QUERIES`, `SUBREDDITS`, `GH_QUERIES`)
- Tune synthesis by editing `triggers/scheduled-brief.md`
- Tune listener behavior by editing `triggers/listener.md`
