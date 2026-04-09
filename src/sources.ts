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
