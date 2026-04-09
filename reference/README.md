# Morning Brief 🌅

A daily AI-powered research brief that scans the agent/AI ecosystem for business opportunities and delivers it to Telegram.

## What it does

1. **Fetches** from Hacker News, Reddit, and GitHub for agent tooling signals
2. **Synthesizes** findings with Claude into a focused brief covering:
   - Hot signals & new launches
   - Developer friction points (where the money is)
   - Monetization patterns others are using
   - New MCP servers & agent tools
   - Concrete opportunity sparks
3. **Delivers** to your Telegram chat

## Setup

```bash
cd morning-brief
bun install
cp .env.example .env
# Edit .env with your keys
```

### Required env vars

| Variable | Where to get it |
|----------|----------------|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| `TELEGRAM_BOT_TOKEN` | Your existing bot, or create via [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_CHAT_ID` | Send a message to your bot, then hit `https://api.telegram.org/bot<TOKEN>/getUpdates` |
| `GITHUB_TOKEN` | Optional — [github.com/settings/tokens](https://github.com/settings/tokens) for higher rate limits |

## Usage

```bash
# Full run — fetches, synthesizes, sends to Telegram
bun run brief

# Dry run — prints to console instead of sending
bun run test
```

## Schedule it (cron)

Run every morning at 6:30 AM:

```bash
crontab -e
```

Add:
```
30 6 * * * cd /path/to/morning-brief && /path/to/.bun/bin/bun run src/index.ts >> /tmp/morning-brief.log 2>&1
```

Or if you're using your existing Telegram bot's server, add it as a scheduled task there.

## Customization

### Add new data sources

Edit `src/sources.ts`:
- Add subreddits to `SUBREDDITS` array
- Add search queries to `HN_QUERIES`, `GH_QUERIES`, or `REDDIT_SEARCHES`
- Create a new fetcher function and add it to `fetchAllSources()`

### Tune the brief's focus

Edit the `SYSTEM_PROMPT` in `src/synthesize.ts` to adjust:
- What sections appear
- What kind of opportunities to emphasize
- Length and format

### Add Twitter/X

The script doesn't include Twitter due to API access requirements. If you have access:
- Add a `fetchTwitter()` to `sources.ts` using the v2 API
- Search for terms like "MCP server", "agent tool", "AI API"
- Or use Nitter RSS feeds as an alternative

## Cost

~$0.01-0.03 per run (one Claude Sonnet call with ~2-4K input tokens).
At daily usage that's under $1/month.
