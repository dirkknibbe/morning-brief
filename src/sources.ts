/**
 * sources.ts — HN / Reddit / GitHub fetchers for the morning brief.
 *
 * Every returned item carries a stable `id` so downstream dedupe (mongo
 * `seen_items`) is trivial. Running this file directly emits all items
 * as JSON on stdout.
 */

export type Source = "hackernews" | "reddit" | "github" | "stealth";

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

/**
 * A source that errored on every attempt is `failed`, not `empty` — the brief
 * needs to tell "the well is dry" apart from "the pipe is broken".
 */
export type SourceStatus = "ok" | "empty" | "failed";

export function sourceStatus(counts: {
  items: number;
  errors: number;
  attempts: number;
}): SourceStatus {
  if (counts.items > 0) return "ok";
  return counts.errors > 0 ? "failed" : "empty";
}

export interface FetchResult {
  items: RawItem[];
  status: SourceStatus;
  note?: string;
}

export interface FetchDeps {
  token?: string;
  fetchFn?: typeof fetch;
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

export async function fetchHackerNews(deps: FetchDeps = {}): Promise<FetchResult> {
  const doFetch = deps.fetchFn ?? fetch;
  const items: RawItem[] = [];
  const seen = new Set<string>();
  let errors = 0;

  for (const query of HN_QUERIES) {
    try {
      const since = Math.floor(Date.now() / 1000) - 86400;
      const res = await doFetch(
        `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(
          query
        )}&tags=story&numericFilters=created_at_i>${since}`
      );
      if (!res.ok) throw new Error(`HN ${res.status}`);
      const data = (await res.json()) as any;

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
      errors++;
      console.warn(`[HN] query "${query}" failed:`, (e as Error).message);
    }
  }

  return {
    items: items.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 15),
    status: sourceStatus({
      items: items.length,
      errors,
      attempts: HN_QUERIES.length,
    }),
  };
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

async function redditFetch(url: string, doFetch: typeof fetch): Promise<any> {
  const res = await doFetch(url, {
    headers: { "User-Agent": "MorningBrief/2.0" },
  });
  if (!res.ok) throw new Error(`Reddit ${res.status}`);
  return res.json();
}

export async function fetchReddit(deps: FetchDeps = {}): Promise<FetchResult> {
  const doFetch = deps.fetchFn ?? fetch;
  const items: RawItem[] = [];
  const seen = new Set<string>();
  let errors = 0;

  for (const sub of SUBREDDITS) {
    try {
      const data = await redditFetch(
        `https://old.reddit.com/r/${sub}/hot.json?limit=10&t=day`,
        doFetch
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
      errors++;
      console.warn(`[Reddit] r/${sub} failed:`, (e as Error).message);
    }
  }

  for (const { sub, q } of REDDIT_SEARCHES) {
    try {
      const data = await redditFetch(
        `https://old.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(
          q
        )}&sort=new&t=day&limit=5`,
        doFetch
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
      errors++;
      console.warn(`[Reddit] search "${q}" failed:`, (e as Error).message);
    }
  }

  return {
    items: items.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 15),
    status: sourceStatus({
      items: items.length,
      errors,
      attempts: SUBREDDITS.length + REDDIT_SEARCHES.length,
    }),
  };
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

const ghHeaders = (token?: string): Record<string, string> => {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
};

export async function fetchGitHub(deps: FetchDeps = {}): Promise<FetchResult> {
  const doFetch = deps.fetchFn ?? fetch;
  const token = deps.token ?? process.env.GITHUB_TOKEN;
  const items: RawItem[] = [];
  const seen = new Set<string>();
  let errors = 0;
  let note: string | undefined;

  // Unauthenticated search still works (at a lower rate limit), so an expired
  // token must degrade the brief rather than empty it.
  let useAuth = Boolean(token);

  const weekAgo = new Date(Date.now() - 7 * 86400 * 1000)
    .toISOString()
    .slice(0, 10);

  for (const query of GH_QUERIES) {
    try {
      const q = encodeURIComponent(`${query} pushed:>${weekAgo}`);
      const url = `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=5`;

      let res = await doFetch(url, { headers: ghHeaders(useAuth ? token : undefined) });
      if (res.status === 401 && useAuth) {
        useAuth = false;
        note = "GITHUB_TOKEN rejected (401) — continuing unauthenticated";
        console.warn(`[GH] ${note}`);
        res = await doFetch(url, { headers: ghHeaders(undefined) });
      }

      if (!res.ok) throw new Error(`GH ${res.status}`);
      const data = (await res.json()) as any;

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
      errors++;
      console.warn(`[GH] query "${query}" failed:`, (e as Error).message);
    }
  }

  return {
    items: items.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 15),
    status: sourceStatus({
      items: items.length,
      errors,
      attempts: GH_QUERIES.length,
    }),
    note,
  };
}

// ── Aggregate ─────────────────────────────────────────────────────────

export interface SourceHealth {
  status: SourceStatus;
  count: number;
  note?: string;
}

// A rejected promise means the fetcher itself threw — treat that as failed,
// never as an empty result.
const settled = (r: PromiseSettledResult<FetchResult>): FetchResult =>
  r.status === "fulfilled"
    ? r.value
    : { items: [], status: "failed", note: String(r.reason) };

const health = (r: FetchResult): SourceHealth => ({
  status: r.status,
  count: r.items.length,
  note: r.note,
});

export async function fetchAllSources(deps: FetchDeps = {}): Promise<{
  hn: RawItem[];
  reddit: RawItem[];
  github: RawItem[];
  health: Record<Source, SourceHealth>;
}> {
  const [hn, reddit, github] = await Promise.allSettled([
    fetchHackerNews(deps),
    fetchReddit(deps),
    fetchGitHub(deps),
  ]);
  const results = {
    hackernews: settled(hn),
    reddit: settled(reddit),
    github: settled(github),
  };
  return {
    hn: results.hackernews.items,
    reddit: results.reddit.items,
    github: results.github.items,
    health: {
      hackernews: health(results.hackernews),
      reddit: health(results.reddit),
      github: health(results.github),
    },
  };
}

// ── CLI entrypoint ────────────────────────────────────────────────────

if (import.meta.main) {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");

  const data = await fetchAllSources();

  // Truncate summaries in-place so downstream consumers don't eat huge blobs.
  for (const arr of [data.hn, data.reddit, data.github]) {
    for (const it of arr) {
      if (it.summary && it.summary.length > 240) it.summary = it.summary.slice(0, 240) + "…";
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  mkdirSync("data", { recursive: true });
  const outPath = join("data", `fetch-${today}.json`);
  writeFileSync(outPath, JSON.stringify(data, null, 2));

  // Compact summary to stdout: counts, path, top 3 titles per source.
  const failed = (Object.keys(data.health) as Source[]).filter(
    (s) => data.health[s].status === "failed"
  );

  const summary = {
    path: outPath,
    counts: { hn: data.hn.length, reddit: data.reddit.length, github: data.github.length },
    health: data.health,
    failed_sources: failed,
    top: {
      hn: data.hn.slice(0, 3).map((i) => ({ id: i.id, title: i.title, score: i.score })),
      reddit: data.reddit.slice(0, 3).map((i) => ({ id: i.id, title: i.title, score: i.score })),
      github: data.github.slice(0, 3).map((i) => ({ id: i.id, title: i.title, score: i.score })),
    },
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
}
