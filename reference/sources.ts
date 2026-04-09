/**
 * Morning Brief - Data Sources
 *
 * Pulls from:
 * 1. Hacker News (official Firebase API - no auth)
 * 2. Reddit (public JSON endpoints - no auth)
 * 3. GitHub (search API - optional auth for rate limits)
 */

export interface RawItem {
  source: string;
  title: string;
  url: string;
  score?: number;
  comments?: number;
  commentsUrl?: string;
  summary?: string;
  timestamp?: number;
}

// ── Hacker News ──────────────────────────────────────────────────────

const HN_API = "https://hacker-news.firebaseio.com/v0";
const HN_SEARCH = "https://hn.algolia.com/api/v1";

const HN_QUERIES = [
  "MCP server",
  "AI agent tool",
  "agent framework",
  "LLM API",
  "micropayment API",
  "browser automation AI",
  "AI agent infrastructure",
];

export async function fetchHackerNews(): Promise<RawItem[]> {
  const items: RawItem[] = [];
  const seen = new Set<string>();

  // Use Algolia search API for targeted queries (last 24h)
  const oneDayAgo = Math.floor(Date.now() / 1000) - 86400;

  for (const query of HN_QUERIES) {
    try {
      const res = await fetch(
        `${HN_SEARCH}/search?query=${encodeURIComponent(query)}&tags=story&numericFilters=created_at_i>${oneDayAgo}&hitsPerPage=5`
      );
      if (!res.ok) continue;
      const data = (await res.json()) as any;

      for (const hit of data.hits ?? []) {
        if (seen.has(hit.objectID)) continue;
        seen.add(hit.objectID);

        items.push({
          source: "hackernews",
          title: hit.title,
          url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
          score: hit.points,
          comments: hit.num_comments,
          commentsUrl: `https://news.ycombinator.com/item?id=${hit.objectID}`,
          timestamp: hit.created_at_i,
        });
      }
    } catch (e) {
      console.warn(`[HN] Query "${query}" failed:`, (e as Error).message);
    }
  }

  // Also scan top/new stories for anything agent-related
  try {
    const topRes = await fetch(`${HN_API}/topstories.json`);
    const topIds = ((await topRes.json()) as number[]).slice(0, 60);

    const storyPromises = topIds.map((id) =>
      fetch(`${HN_API}/item/${id}.json`).then((r) => r.json())
    );
    const stories = await Promise.allSettled(storyPromises);

    const AGENT_KEYWORDS =
      /\b(mcp|agent|llm|ai tool|browser.?use|computer.?use|autonomous|agentic|micropay|x402|a]pi.?monetiz)/i;

    for (const result of stories) {
      if (result.status !== "fulfilled" || !result.value) continue;
      const s = result.value as any;
      if (!s.title || seen.has(String(s.id))) continue;

      if (AGENT_KEYWORDS.test(s.title)) {
        seen.add(String(s.id));
        items.push({
          source: "hackernews",
          title: s.title,
          url: s.url || `https://news.ycombinator.com/item?id=${s.id}`,
          score: s.score,
          comments: s.descendants,
          commentsUrl: `https://news.ycombinator.com/item?id=${s.id}`,
          timestamp: s.time,
        });
      }
    }
  } catch (e) {
    console.warn("[HN] Top stories scan failed:", (e as Error).message);
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
  const res = await fetch(url, {
    headers: { "User-Agent": "MorningBrief/1.0" },
  });
  if (!res.ok) throw new Error(`Reddit ${res.status}`);
  return res.json();
}

export async function fetchReddit(): Promise<RawItem[]> {
  const items: RawItem[] = [];
  const seen = new Set<string>();

  // Hot posts from relevant subreddits
  for (const sub of SUBREDDITS) {
    try {
      const data = await redditFetch(
        `https://old.reddit.com/r/${sub}/hot.json?limit=10&t=day`
      );
      for (const child of data?.data?.children ?? []) {
        const post = child.data;
        if (!post || seen.has(post.id)) continue;
        if (post.stickied) continue;

        seen.add(post.id);
        items.push({
          source: `reddit/r/${sub}`,
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

  // Targeted searches
  for (const { sub, q } of REDDIT_SEARCHES) {
    try {
      const data = await redditFetch(
        `https://old.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(q)}&sort=new&t=day&limit=5`
      );
      for (const child of data?.data?.children ?? []) {
        const post = child.data;
        if (!post || seen.has(post.id)) continue;
        seen.add(post.id);
        items.push({
          source: `reddit/r/${post.subreddit}`,
          title: post.title,
          url: `https://reddit.com${post.permalink}`,
          score: post.score,
          comments: post.num_comments,
          summary: post.selftext?.slice(0, 300) || undefined,
          timestamp: post.created_utc,
        });
      }
    } catch (e) {
      console.warn(`[Reddit] Search "${q}" failed:`, (e as Error).message);
    }
  }

  return items.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 15);
}

// ── GitHub ─────────────────────────────────────────────────────────────

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

  // Search repos created or pushed in last 7 days
  const weekAgo = new Date(Date.now() - 7 * 86400 * 1000)
    .toISOString()
    .slice(0, 10);

  for (const query of GH_QUERIES) {
    try {
      const q = encodeURIComponent(`${query} pushed:>${weekAgo}`);
      const res = await fetch(
        `https://api.github.com/search/repositories?q=${q}&sort=stars&per_page=5`,
        { headers }
      );
      if (!res.ok) continue;
      const data = (await res.json()) as any;

      for (const repo of data.items ?? []) {
        if (seen.has(repo.full_name)) continue;
        seen.add(repo.full_name);

        items.push({
          source: "github",
          title: `${repo.full_name} — ${repo.description || "no description"}`,
          url: repo.html_url,
          score: repo.stargazers_count,
          summary: repo.description || undefined,
          timestamp: new Date(repo.pushed_at).getTime() / 1000,
        });
      }
    } catch (e) {
      console.warn(`[GitHub] Query "${query}" failed:`, (e as Error).message);
    }
  }

  return items.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 15);
}

// ── Aggregate ──────────────────────────────────────────────────────────

export async function fetchAllSources(): Promise<{
  hn: RawItem[];
  reddit: RawItem[];
  github: RawItem[];
}> {
  console.log("📡 Fetching from all sources...");

  const [hn, reddit, github] = await Promise.allSettled([
    fetchHackerNews(),
    fetchReddit(),
    fetchGitHub(),
  ]);

  const result = {
    hn: hn.status === "fulfilled" ? hn.value : [],
    reddit: reddit.status === "fulfilled" ? reddit.value : [],
    github: github.status === "fulfilled" ? github.value : [],
  };

  console.log(
    `  HN: ${result.hn.length} | Reddit: ${result.reddit.length} | GitHub: ${result.github.length}`
  );

  return result;
}
