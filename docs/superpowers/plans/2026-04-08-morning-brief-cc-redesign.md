# Morning Brief CC Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `morning-brief` as a Claude Code agent-driven daily brief: RemoteTrigger runs an agent that fetches signals, investigates via WebFetch, dedupes against MongoDB, synthesizes, and delivers to Telegram — plus a local tmux listener for interactive "dig deeper" replies.

**Architecture:** Thin Bun CLIs for mechanical work (HN/Reddit/GH fetching and Telegram delivery). Everything else — dedupe, investigation, synthesis, git, mongo — is orchestrated by a Claude Code agent via a prompt (`triggers/scheduled-brief.md`). A second prompt (`triggers/listener.md`) drives an on-demand interactive session.

**Tech Stack:** Bun + TypeScript, `@anthropic-ai/sdk` (only for the listener session, optional), MongoDB Atlas, Claude Code RemoteTrigger, `plugin:telegram` MCP, `mcp__mongodb__*` MCP.

**Spec:** `docs/superpowers/specs/2026-04-08-morning-brief-cc-redesign-design.md`

**Working directory:** `/Users/dirkknibbe/morning-brief` (currently contains source zip + extracted files, not yet a git repo).

---

## File Structure

```
morning-brief/
├── .env.example
├── .gitignore
├── README.md
├── package.json
├── tsconfig.json
├── bun.lockb                         (generated)
├── src/
│   ├── sources.ts                    (port + id field + CLI main)
│   ├── telegram.ts                   (port + stdin CLI main + --dry-run)
│   └── __tests__/
│       ├── sources.test.ts           (id helpers)
│       └── telegram.test.ts          (splitMessage)
├── triggers/
│   ├── scheduled-brief.md            (agent prompt for the RemoteTrigger)
│   └── listener.md                   (agent prompt for the local listener)
├── briefs/                           (created on first run; one .md per day)
└── docs/
    └── superpowers/
        ├── specs/2026-04-08-morning-brief-cc-redesign-design.md  (exists)
        └── plans/2026-04-08-morning-brief-cc-redesign.md          (this file)
```

The original flat `index.ts`, `sources.ts`, `synthesize.ts`, `telegram.ts`, `package.json`, `README.md` at repo root are superseded — we keep the zip as a reference and rewrite under `src/`.

---

## Task 1: Project Scaffolding

**Files:**
- Create: `/Users/dirkknibbe/morning-brief/.gitignore`
- Create: `/Users/dirkknibbe/morning-brief/.env.example`
- Create: `/Users/dirkknibbe/morning-brief/package.json`
- Create: `/Users/dirkknibbe/morning-brief/tsconfig.json`
- Delete (or move aside): root-level `index.ts`, `sources.ts`, `synthesize.ts`, `telegram.ts`, `package.json`, `README.md`, `morning-brief-files.zip` → moved to `reference/` for history.

- [ ] **Step 1: Move original files into `reference/`**

```bash
cd /Users/dirkknibbe/morning-brief
mkdir -p reference
mv index.ts sources.ts synthesize.ts telegram.ts package.json README.md morning-brief-files.zip reference/
```

- [ ] **Step 2: Initialize git**

```bash
cd /Users/dirkknibbe/morning-brief
git init -b main
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
bun.lockb
.env
.env.local
*.log
.DS_Store
reference/morning-brief-files.zip
```

- [ ] **Step 4: Create `.env.example`**

```
# Anthropic — used by listener (optional) and local manual synth tests
ANTHROPIC_API_KEY=

# Telegram delivery
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# MongoDB Atlas — state store (seen_items, signals, preferences)
MONGODB_URI=
MONGODB_DB=morning-brief

# GitHub — raises search rate limits (optional)
GITHUB_TOKEN=
```

- [ ] **Step 5: Create `package.json`**

```json
{
  "name": "morning-brief",
  "version": "2.0.0",
  "type": "module",
  "private": true,
  "scripts": {
    "fetch": "bun run src/sources.ts",
    "fetch:pretty": "bun run src/sources.ts --pretty",
    "send": "bun run src/telegram.ts",
    "send:dry": "bun run src/telegram.ts --dry-run",
    "test": "bun test"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.5.0"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0"
  }
}
```

- [ ] **Step 6: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext"],
    "types": ["bun-types"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "esModuleInterop": true
  },
  "include": ["src/**/*", "triggers/**/*"]
}
```

- [ ] **Step 7: Install deps**

Run: `cd /Users/dirkknibbe/morning-brief && bun install`
Expected: creates `node_modules/` and `bun.lockb`.

- [ ] **Step 8: Initial commit**

```bash
cd /Users/dirkknibbe/morning-brief
git add .gitignore .env.example package.json tsconfig.json bun.lockb reference/ docs/
git commit -m "chore: scaffold morning-brief v2 (agent-driven redesign)"
```

---

## Task 2: `src/sources.ts` — port with stable IDs and CLI

**Files:**
- Create: `/Users/dirkknibbe/morning-brief/src/sources.ts`

The original `reference/sources.ts` already has HN, Reddit, and GitHub fetchers. We port it, add a stable `id` field on every `RawItem`, and add a CLI entry at the bottom so `bun run src/sources.ts` prints `fetchAllSources()` as JSON.

- [ ] **Step 1: Write `src/sources.ts`**

```ts
/**
 * sources.ts — HN / Reddit / GitHub fetchers for the morning brief.
 *
 * Every returned item carries a stable `id` so downstream dedupe (mongo
 * `seen_items`) is trivial. Running this file directly emits all items
 * as JSON on stdout.
 */

export type Source = "hackernews" | "reddit" | "github";

export interface RawItem {
  id: string;               // stable: "hn:123", "reddit:abc", "gh:owner/repo"
  source: Source;
  sourceLabel: string;      // e.g. "reddit/r/LocalLLaMA"
  title: string;
  url: string;
  commentsUrl?: string;
  score?: number;
  comments?: number;
  summary?: string;
  timestamp?: number;       // unix seconds
}

// ── ID helpers (pure, tested) ─────────────────────────────────────────

export const hnId = (objectID: string | number) => `hn:${objectID}`;
export const redditId = (postId: string) => `reddit:${postId}`;
export const ghId = (fullName: string) => `gh:${fullName}`;

// ── Hacker News ───────────────────────────────────────────────────────

const HN_QUERIES = [
  "mcp server",
  "ai agent",
  "llm api",
  "claude api",
  "browser automation agent",
];

export async function fetchHackerNews(): Promise<RawItem[]> {
  const items: RawItem[] = [];
  const seen = new Set<string>();

  for (const query of HN_QUERIES) {
    try {
      const since = Math.floor(Date.now() / 1000) - 86400;
      const res = await fetch(
        `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(
          query
        )}&tags=story&numericFilters=created_at_i>${since}`
      );
      if (!res.ok) throw new Error(`HN ${res.status}`);
      const data = await res.json();

      for (const hit of data.hits ?? []) {
        const id = hnId(hit.objectID);
        if (seen.has(id)) continue;
        seen.add(id);
        items.push({
          id,
          source: "hackernews",
          sourceLabel: "hackernews",
          title: hit.title,
          url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
          commentsUrl: `https://news.ycombinator.com/item?id=${hit.objectID}`,
          score: hit.points,
          comments: hit.num_comments,
          timestamp: hit.created_at_i,
        });
      }
    } catch (e) {
      console.warn(`[HN] query "${query}" failed:`, (e as Error).message);
    }
  }

  return items.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 15);
}

// ── Reddit ────────────────────────────────────────────────────────────

const SUBREDDITS = [
  "MachineLearning",
  "LocalLLaMA",
  "artificial",
  "LangChain",
  "ClaudeAI",
  "AutoGPT",
  "ChatGPTCoding",
  "selfhosted",
];

const REDDIT_SEARCHES = [
  { sub: "all", q: "MCP server agent" },
  { sub: "all", q: "AI agent tool API" },
  { sub: "all", q: "browser automation LLM" },
  { sub: "all", q: "micropayment API developer" },
];

async function redditFetch(url: string): Promise<any> {
  const res = await fetch(url, { headers: { "User-Agent": "MorningBrief/2.0" } });
  if (!res.ok) throw new Error(`Reddit ${res.status}`);
  return res.json();
}

export async function fetchReddit(): Promise<RawItem[]> {
  const items: RawItem[] = [];
  const seen = new Set<string>();

  for (const sub of SUBREDDITS) {
    try {
      const data = await redditFetch(
        `https://old.reddit.com/r/${sub}/hot.json?limit=10&t=day`
      );
      for (const child of data?.data?.children ?? []) {
        const post = child.data;
        if (!post || post.stickied) continue;
        const id = redditId(post.id);
        if (seen.has(id)) continue;
        seen.add(id);
        items.push({
          id,
          source: "reddit",
          sourceLabel: `reddit/r/${sub}`,
          title: post.title,
          url: `https://reddit.com${post.permalink}`,
          score: post.score,
          comments: post.num_comments,
          summary: post.selftext?.slice(0, 300) || undefined,
          timestamp: post.created_utc,
        });
      }
    } catch (e) {
      console.warn(`[Reddit] r/${sub} failed:`, (e as Error).message);
    }
  }

  for (const { sub, q } of REDDIT_SEARCHES) {
    try {
      const data = await redditFetch(
        `https://old.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(
          q
        )}&sort=new&t=day&limit=5`
      );
      for (const child of data?.data?.children ?? []) {
        const post = child.data;
        if (!post) continue;
        const id = redditId(post.id);
        if (seen.has(id)) continue;
        seen.add(id);
        items.push({
          id,
          source: "reddit",
          sourceLabel: `reddit/r/${post.subreddit}`,
          title: post.title,
          url: `https://reddit.com${post.permalink}`,
          score: post.score,
          comments: post.num_comments,
          summary: post.selftext?.slice(0, 300) || undefined,
          timestamp: post.created_utc,
        });
      }
    } catch (e) {
      console.warn(`[Reddit] search "${q}" failed:`, (e as Error).message);
    }
  }

  return items.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 15);
}

// ── GitHub ────────────────────────────────────────────────────────────

const GH_QUERIES = [
  "mcp server",
  "mcp-server",
  "ai agent tool",
  "browser-use agent",
  "llm micropayment",
  "agent framework",
];

export async function fetchGitHub(): Promise<RawItem[]> {
  const items: RawItem[] = [];
  const seen = new Set<string>();
  const token = process.env.GITHUB_TOKEN;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const weekAgo = new Date(Date.now() - 7 * 86400 * 1000)
    .toISOString()
    .slice(0, 10);

  for (const query of GH_QUERIES) {
    try {
      const q = encodeURIComponent(`${query} pushed:>${weekAgo}`);
      const res = await fetch(
        `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=5`,
        { headers }
      );
      if (!res.ok) throw new Error(`GH ${res.status}`);
      const data = await res.json();

      for (const repo of data.items ?? []) {
        const id = ghId(repo.full_name);
        if (seen.has(id)) continue;
        seen.add(id);
        items.push({
          id,
          source: "github",
          sourceLabel: "github",
          title: `${repo.full_name} — ${repo.description ?? ""}`,
          url: repo.html_url,
          score: repo.stargazers_count,
          timestamp: Math.floor(new Date(repo.pushed_at).getTime() / 1000),
          summary: repo.description || undefined,
        });
      }
    } catch (e) {
      console.warn(`[GH] query "${query}" failed:`, (e as Error).message);
    }
  }

  return items.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 15);
}

// ── Aggregate ─────────────────────────────────────────────────────────

export async function fetchAllSources(): Promise<{
  hn: RawItem[];
  reddit: RawItem[];
  github: RawItem[];
}> {
  const [hn, reddit, github] = await Promise.allSettled([
    fetchHackerNews(),
    fetchReddit(),
    fetchGitHub(),
  ]);
  return {
    hn: hn.status === "fulfilled" ? hn.value : [],
    reddit: reddit.status === "fulfilled" ? reddit.value : [],
    github: github.status === "fulfilled" ? github.value : [],
  };
}

// ── CLI entrypoint ────────────────────────────────────────────────────

if (import.meta.main) {
  const pretty = process.argv.includes("--pretty");
  const data = await fetchAllSources();
  const json = JSON.stringify(data, null, pretty ? 2 : 0);
  process.stdout.write(json + "\n");
}
```

- [ ] **Step 2: Manual smoke test the CLI**

Run: `cd /Users/dirkknibbe/morning-brief && bun run fetch:pretty | head -50`
Expected: JSON output with `hn`, `reddit`, `github` keys, each containing item arrays with `id` fields like `hn:12345678`.

- [ ] **Step 3: Commit**

```bash
git add src/sources.ts
git commit -m "feat(sources): port fetchers with stable ids and CLI entrypoint"
```

---

## Task 3: Unit test `id` helpers

**Files:**
- Create: `/Users/dirkknibbe/morning-brief/src/__tests__/sources.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, test } from "bun:test";
import { hnId, redditId, ghId } from "../sources.ts";

describe("id helpers", () => {
  test("hnId prefixes with hn:", () => {
    expect(hnId(12345)).toBe("hn:12345");
    expect(hnId("abc")).toBe("hn:abc");
  });
  test("redditId prefixes with reddit:", () => {
    expect(redditId("t3_xyz")).toBe("reddit:t3_xyz");
  });
  test("ghId prefixes with gh:", () => {
    expect(ghId("anthropics/claude-code")).toBe("gh:anthropics/claude-code");
  });
});
```

- [ ] **Step 2: Run tests**

Run: `bun test src/__tests__/sources.test.ts`
Expected: 3 tests pass (implementation already exists from Task 2).

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/sources.test.ts
git commit -m "test(sources): unit tests for id helpers"
```

---

## Task 4: `src/telegram.ts` — port with stdin CLI

**Files:**
- Create: `/Users/dirkknibbe/morning-brief/src/telegram.ts`

- [ ] **Step 1: Write `src/telegram.ts`**

```ts
/**
 * telegram.ts — Bot API delivery.
 *
 * Library: `sendToTelegram(text, { dryRun })`.
 * CLI: reads stdin and sends. `--dry-run` prints instead.
 */

const TG_API = "https://api.telegram.org";

export async function sendToTelegram(
  brief: string,
  options?: { dryRun?: boolean }
): Promise<void> {
  if (options?.dryRun) {
    console.log("--- DRY RUN ---");
    console.log(brief);
    console.log(`--- (${brief.length} chars) ---`);
    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
  }

  const chunks = splitMessage(brief, 4096);
  for (const chunk of chunks) {
    const res = await fetch(`${TG_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      if (err.includes("can't parse entities")) {
        await fetch(`${TG_API}/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: chunk,
            disable_web_page_preview: true,
          }),
        });
      } else {
        throw new Error(`Telegram API error: ${err}`);
      }
    }
    if (chunks.length > 1) await new Promise((r) => setTimeout(r, 500));
  }
}

export function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt < maxLen * 0.5) splitAt = remaining.lastIndexOf(" ", maxLen);
    if (splitAt < maxLen * 0.3) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }
  return chunks;
}

// ── CLI entrypoint: read stdin, send ──────────────────────────────────

async function readStdin(): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of Bun.stdin.stream()) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

if (import.meta.main) {
  const dryRun = process.argv.includes("--dry-run");
  const text = (await readStdin()).trim();
  if (!text) {
    console.error("telegram: stdin was empty");
    process.exit(1);
  }
  await sendToTelegram(text, { dryRun });
  if (!dryRun) console.log(`sent ${text.length} chars to telegram`);
}
```

- [ ] **Step 2: Smoke test dry-run CLI**

Run: `echo "hello from morning brief" | bun run send:dry`
Expected: prints `--- DRY RUN ---` block with the message.

- [ ] **Step 3: Commit**

```bash
git add src/telegram.ts
git commit -m "feat(telegram): port sender with stdin CLI and --dry-run"
```

---

## Task 5: Unit test `splitMessage`

**Files:**
- Create: `/Users/dirkknibbe/morning-brief/src/__tests__/telegram.test.ts`

- [ ] **Step 1: Write tests**

```ts
import { describe, expect, test } from "bun:test";
import { splitMessage } from "../telegram.ts";

describe("splitMessage", () => {
  test("returns single chunk when under limit", () => {
    expect(splitMessage("hello", 100)).toEqual(["hello"]);
  });

  test("splits at newline boundary when possible", () => {
    const text = "a".repeat(50) + "\n" + "b".repeat(50);
    const chunks = splitMessage(text, 60);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toBe("a".repeat(50));
    expect(chunks[1]).toBe("b".repeat(50));
  });

  test("splits at space when no newline near limit", () => {
    const text = "word ".repeat(30).trim(); // 149 chars
    const chunks = splitMessage(text, 50);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(50);
  });

  test("hard-splits when no whitespace found", () => {
    const text = "x".repeat(200);
    const chunks = splitMessage(text, 50);
    expect(chunks.length).toBe(4);
    expect(chunks.every((c) => c.length <= 50)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `bun test src/__tests__/telegram.test.ts`
Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/telegram.test.ts
git commit -m "test(telegram): unit tests for splitMessage"
```

---

## Task 6: `triggers/scheduled-brief.md` — agent prompt for RemoteTrigger

**Files:**
- Create: `/Users/dirkknibbe/morning-brief/triggers/scheduled-brief.md`

This file IS the scheduled runtime. The RemoteTrigger loads it as the agent's task prompt.

- [ ] **Step 1: Write the prompt**

```markdown
# Morning Brief — Scheduled Run

You are the morning-brief scheduled agent. Your job is to produce Dirk's daily AI/agent-ecosystem brief end to end, then deliver and archive it.

Working directory: the `morning-brief` repo (already cloned by the trigger).
Today's date: use the current date in `YYYY-MM-DD` format for filenames and mongo queries.

## Tools you will use

- `Bash` — run the fetch and send CLIs, plus git commands.
- `WebFetch` — drill into URLs that look promising for deeper context.
- `mcp__mongodb__find` / `insert-many` / `update-many` / `aggregate` — read/write state in the `morning-brief` database.
- `Write` — create `briefs/<today>.md`.

## About Dirk (context for synthesis)

- Building UIPE, an MCP server that gives AI agents temporal perception of web UIs.
- Solo developer, looking for low-overhead business opportunities for independent developers.
- Revenue target: even $50-100/month recurring to start.
- Stack: TypeScript/Bun, Java/Spring Boot, Kafka, Kubernetes.
- Distribution model: MCPAASTA (MCP As A Service To Agents) with micropayment rails.

## Step-by-step

### 1. Fetch raw signals

Run `bun run fetch` via Bash. Parse the JSON — it contains `hn`, `reddit`, `github` arrays. Expect ~20-45 items total. If empty, send an "all sources empty" note to Telegram via `bun run send` and exit.

### 2. Dedupe against `seen_items`

For all item `id`s, call `mcp__mongodb__find` on `seen_items` with `{_id: {$in: [...ids]}}` to see which are already known. Then:

- For new items: insert with `{_id, source, title, url, first_seen: now, last_seen: now, times_seen: 1, last_score}`.
- For returning items: `update-many` to bump `last_seen`, `times_seen += 1`, update `last_score`.

Annotate each item in-memory as `isNew` or `isReturning` (and note `times_seen` for returning items — "seen 3 days running" is worth surfacing).

### 3. Pull trending themes

Call `mcp__mongodb__aggregate` on `signals` for the last 7 days:

```js
[
  { $match: { date: { $gte: "<7 days ago YYYY-MM-DD>" } } },
  { $group: { _id: "$theme", total: { $sum: "$mentions" }, days: { $addToSet: "$date" } } },
  { $sort: { total: -1 } },
  { $limit: 8 }
]
```

Use this as "what's been building" context in your synthesis.

### 4. Investigate top candidates

Rank all items by: `score` (log-scaled) + `10 if isNew else 0` + `5 * min(times_seen, 3) if isReturning`. Take the top 10.

For each, call `WebFetch` on its `url` (for GH repos, fetch the README; for HN/Reddit posts, fetch the linked article or the comments URL). Cap total fetches at 15. Skip failures silently — do not retry.

### 5. Draft the brief

Write the brief yourself, directly, as markdown. You are Claude; no SDK call is needed. Target 300-500 words, dense, no fluff.

Structure:

- **Lead** with the single most interesting opportunity or friction point.
- `🔥 *Hot Signals*` — new tools, launches, trends.
- `😤 *Developer Friction*` — complaints, pain points, things broken or missing. **This is where the money is.**
- `💰 *Monetization Patterns*` — how others are charging.
- `🛠️ *New MCP/Agent Tools*` — repos, frameworks, servers worth examining.
- `📈 *Still Trending*` — items marked `isReturning` with `times_seen >= 2`, one-liner each.
- `💡 *Opportunity Sparks*` — 2-3 concrete micro-SaaS or API ideas Dirk could build.
- **One action item** Dirk could execute today.

Formatting rules:

- Telegram markdown: bold with `*asterisks*` (single), no `#` headers, emoji as section markers.
- Each bullet 1-2 lines max.
- If today's data is thin, say so honestly — don't pad.

Also produce a `themes` list: 3-8 short free-text labels (e.g. `"MCP auth"`, `"browser agents"`, `"llm micropayment"`) that summarize what you wrote about. You'll need these in step 8.

### 6. Deliver to Telegram

Prepend the header:

```
☀️ *Morning Brief* — <weekday>, <mon> <day>

```

Pipe the whole thing to `bun run send` via Bash. If it fails, retry once. If it still fails, write the brief to `briefs/<today>-FAILED.md` and exit with an error.

### 7. Archive to the repo

Use `Write` to create `briefs/<today>.md` with the full brief (header included).

Then via Bash:

```bash
git add briefs/<today>.md
git commit -m "brief: <today>"
git push origin main
```

### 8. Update `signals`

For each theme, insert into `signals` with `mcp__mongodb__insert-many`:

```js
{ date: "<today>", theme: "<theme>", mentions: <count of items tagged>, source_ids: [<item ids you tagged with this theme>] }
```

Tagging is soft: you pick which items contributed to which theme based on your own read of the content. Don't overthink it.

### 9. On error

At any step, if something unrecoverable fails: write a short error summary (`⚠️ Morning brief failed at step N: <reason>`) and send it via `bun run send`. This way Dirk sees the failure in the same Telegram chat.

## Environment assumed available

- `ANTHROPIC_API_KEY` (implicit — you're Claude)
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
- `MONGODB_URI`, `MONGODB_DB=morning-brief`
- `GITHUB_TOKEN` (optional)
- Git configured with push credentials for this repo
```

- [ ] **Step 2: Commit**

```bash
git add triggers/scheduled-brief.md
git commit -m "feat(triggers): scheduled-brief agent prompt"
```

---

## Task 7: `triggers/listener.md` — agent prompt for local tmux listener

**Files:**
- Create: `/Users/dirkknibbe/morning-brief/triggers/listener.md`

- [ ] **Step 1: Write the prompt**

```markdown
# Morning Brief — Interactive Listener

You are the morning-brief interactive listener. You sit in a long-running local Claude Code session and respond to Telegram messages Dirk sends about his daily brief.

Working directory: the `morning-brief` repo.

## How messages arrive

The `plugin:telegram` MCP surfaces incoming messages as tool results tagged with `<channel source="telegram" chat_id="..." message_id="..." ...>`. Reply with `mcp__plugin_telegram_telegram__reply`, passing the `chat_id` back.

Only respond to messages from Dirk's chat (the same `TELEGRAM_CHAT_ID` the scheduled brief uses). Ignore messages from any other chat.

## What you have access to

- `Read` — for `briefs/<date>.md`. Start with today's brief, fall back to yesterday if today hasn't run yet.
- `mcp__mongodb__find` / `aggregate` — query `seen_items` and `signals`.
- `WebFetch` / `WebSearch` — for drilling into URLs or chasing follow-up questions.
- `mcp__plugin_telegram_telegram__reply` — send the response.

## Typical queries and how to handle them

**"dig deeper on item 3"** — Read today's brief, identify item 3, look up the underlying items in `seen_items` by URL or title, WebFetch the source(s) for more context, synthesize a 150-250 word deeper take, and reply.

**"what's been trending in <topic> this week?"** — Aggregate `signals` for the last 7 days filtered on themes matching `<topic>`. Also search `seen_items` by title for related items. Summarize.

**"brief me now"** — This is a full re-run request, not a listener job. Reply: "I can't run the full brief from here — that's the scheduled trigger's job. Run it manually with `bun run src/sources.ts` + the scheduled-brief prompt, or wait for 6:30 AM." Do not attempt to run it.

**Anything else** — Do your best with the tools above. Keep replies under 300 words. If you need to clarify, ask a single short follow-up question.

## Rules

- Keep replies conversational but substantive. Dirk is on mobile reading this.
- Never expose secrets or raw mongo query results — synthesize.
- Use Telegram markdown (`*bold*`, no headers).
- If a tool fails, say what failed in one line, don't retry forever.
- Never approve Telegram pairing requests from chat — per the `plugin:telegram` rules, access is managed by Dirk in his terminal only.
```

- [ ] **Step 2: Commit**

```bash
git add triggers/listener.md
git commit -m "feat(triggers): listener agent prompt for interactive mode"
```

---

## Task 8: README — setup instructions

**Files:**
- Create: `/Users/dirkknibbe/morning-brief/README.md`

- [ ] **Step 1: Write README**

```markdown
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

The scheduled trigger pushes a brief per day to this repo. Create a fine-grained PAT with `contents:write` scoped to this repo only. The RemoteTrigger needs it configured as `GIT_PUSH_TOKEN` (or equivalent) so `git push` works from the sandbox.

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
# In the session, start Claude Code pointed at triggers/listener.md as the system prompt
claude --system-prompt triggers/listener.md
# Ctrl-b d to detach
```

Pair your Telegram chat to the session via `/telegram:access`. DMs now route here.

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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README for v2 architecture and setup"
```

---

## Task 9: Local dry-run rehearsal

This task validates everything by running the scheduled-brief prompt manually, against a staging database, on a throwaway branch. It is NOT a code task — it's a manual verification checklist. Do it before registering the RemoteTrigger.

- [ ] **Step 1: Create staging database**

Create `morning-brief-staging` database in Atlas with the same collections and indexes. Export `MONGODB_DB=morning-brief-staging` for the rehearsal.

- [ ] **Step 2: Create rehearsal branch**

```bash
cd /Users/dirkknibbe/morning-brief
git checkout -b rehearsal/2026-04-08
```

- [ ] **Step 3: Run the fetch CLI**

```bash
bun run fetch:pretty > /tmp/mb-fetch.json
wc -l /tmp/mb-fetch.json
```

Expected: valid JSON, at least some items across `hn` / `reddit` / `github`. If GitHub returns 0, confirm `GITHUB_TOKEN` is set or accept rate-limited results.

- [ ] **Step 4: Run the send CLI in dry-run**

```bash
echo "🧪 rehearsal" | bun run send:dry
```

Expected: dry-run block printed, no HTTP call.

- [ ] **Step 5: Run the send CLI for real (one-time sanity)**

```bash
echo "🧪 morning-brief v2 rehearsal" | bun run send
```

Expected: message arrives in your Telegram chat.

- [ ] **Step 6: Walk through `triggers/scheduled-brief.md` manually**

Open a Claude Code session in this directory. Paste the contents of `triggers/scheduled-brief.md` as your task. Let it run end to end against the staging DB and the rehearsal branch. Confirm:

- `briefs/<today>.md` created and committed on `rehearsal/...`
- Telegram message delivered
- `seen_items` populated in staging
- `signals` populated in staging

- [ ] **Step 7: Clean up rehearsal branch**

```bash
git checkout main
git branch -D rehearsal/2026-04-08
# optionally: drop the staging db collections
```

- [ ] **Step 8: Register the real RemoteTrigger**

Use the `schedule` skill to register the production trigger per README section 5.

---

## Definition of done

- [ ] All unit tests pass (`bun test`)
- [ ] `bun run fetch:pretty` returns live items
- [ ] `bun run send` delivers to Telegram
- [ ] `triggers/scheduled-brief.md` executed manually against staging produces: a brief in Telegram, a committed `briefs/<date>.md`, populated `seen_items` and `signals`
- [ ] RemoteTrigger registered with cron `30 6 * * *`
- [ ] Local tmux listener session running and paired to Telegram, replying to a test "dig deeper" message
- [ ] Spec success criteria (1, 2, 3 in the design doc) all observed at least once
