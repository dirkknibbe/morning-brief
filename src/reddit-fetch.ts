/**
 * reddit-fetch.ts — fetch a Reddit post + top comments as compact JSON.
 *
 * Usage: bun run src/reddit-fetch.ts <reddit-url>
 *
 * Uses a real UA so old.reddit doesn't 403, and strips the .json response
 * down to just title/selftext/top-N comment bodies so agents can consume
 * it without flooding their context.
 */

interface CompactPost {
  title: string;
  url: string;
  score: number;
  selftext: string;
  comments: Array<{ author: string; score: number; body: string }>;
}

function toOldRedditJson(input: string): string {
  const u = new URL(input);
  u.hostname = "old.reddit.com";
  if (!u.pathname.endsWith(".json")) {
    u.pathname = u.pathname.replace(/\/?$/, "/.json");
  }
  return u.toString();
}

export async function fetchRedditPost(url: string, maxComments = 10): Promise<CompactPost> {
  const jsonUrl = toOldRedditJson(url);
  const res = await fetch(jsonUrl, {
    headers: { "User-Agent": "MorningBrief/2.0 (by /u/dirkknibbe)" },
  });
  if (!res.ok) throw new Error(`Reddit ${res.status} for ${jsonUrl}`);
  const data = (await res.json()) as any[];
  const post = data?.[0]?.data?.children?.[0]?.data ?? {};
  const commentNodes = data?.[1]?.data?.children ?? [];
  const comments = commentNodes
    .map((c: any) => c?.data)
    .filter((c: any) => c && c.body)
    .slice(0, maxComments)
    .map((c: any) => ({
      author: c.author,
      score: c.score,
      body: String(c.body).slice(0, 500),
    }));

  return {
    title: post.title ?? "",
    url: `https://reddit.com${post.permalink ?? ""}`,
    score: post.score ?? 0,
    selftext: String(post.selftext ?? "").slice(0, 1200),
    comments,
  };
}

if (import.meta.main) {
  const url = process.argv[2];
  if (!url) {
    console.error("usage: bun run src/reddit-fetch.ts <reddit-url>");
    process.exit(1);
  }
  const out = await fetchRedditPost(url);
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
}
