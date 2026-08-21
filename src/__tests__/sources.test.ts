import { describe, expect, test } from "bun:test";
import {
  hnId,
  redditId,
  ghId,
  sourceStatus,
  fetchGitHub,
  fetchAllSources,
} from "../sources.ts";

const blockedFetch = (status: number) =>
  (async () => new Response("blocked", { status })) as unknown as typeof fetch;

// Reddit now flows through the stealth browser tier, never fetchFn — every
// fetchAllSources test MUST inject stealthRun or it will spawn the real Python CLI.
const failingStealth = async (urls: string[]) =>
  urls.map((url) => ({ url, status: 403, body: "", error: "blocked" }));

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

describe("sourceStatus", () => {
  test("every attempt erroring is failed, not empty", () => {
    expect(sourceStatus({ items: 0, errors: 12, attempts: 12 })).toBe("failed");
  });

  test("no errors and no items is a quiet day, not a failure", () => {
    expect(sourceStatus({ items: 0, errors: 0, attempts: 9 })).toBe("empty");
  });

  test("items found is ok even when some queries errored", () => {
    expect(sourceStatus({ items: 15, errors: 3, attempts: 12 })).toBe("ok");
  });

  test("partial errors with zero items is degraded, not a quiet day", () => {
    expect(sourceStatus({ items: 0, errors: 5, attempts: 12 })).toBe("failed");
  });
});

describe("fetchGitHub auth fallback", () => {
  const repoPayload = JSON.stringify({
    items: [
      {
        full_name: "coleam00/Archon",
        description: "agent builder",
        html_url: "https://github.com/coleam00/Archon",
        stargazers_count: 42,
        pushed_at: "2026-07-20T00:00:00Z",
      },
    ],
  });

  test("falls back to unauthenticated search when the token is rejected", async () => {
    const authHeadersSeen: boolean[] = [];
    const fetchFn = (async (_url: string, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const hasAuth = Boolean(headers.Authorization);
      authHeadersSeen.push(hasAuth);
      return hasAuth
        ? new Response("Bad credentials", { status: 401 })
        : new Response(repoPayload, { status: 200 });
    }) as unknown as typeof fetch;

    const result = await fetchGitHub({ token: "expired-pat", fetchFn });

    expect(result.status).toBe("ok");
    expect(result.items.length).toBeGreaterThan(0);
    expect(authHeadersSeen).toContain(true);
    expect(authHeadersSeen).toContain(false);
  });

  test("stops resending a token already rejected once", async () => {
    let authAttempts = 0;
    const fetchFn = (async (_url: string, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      if (headers.Authorization) {
        authAttempts++;
        return new Response("Bad credentials", { status: 401 });
      }
      return new Response(repoPayload, { status: 200 });
    }) as unknown as typeof fetch;

    await fetchGitHub({ token: "expired-pat", fetchFn });

    expect(authAttempts).toBe(1);
  });

  test("reports failed when unauthenticated retry also fails", async () => {
    const fetchFn = (async () =>
      new Response("rate limited", { status: 403 })) as unknown as typeof fetch;

    const result = await fetchGitHub({ token: "expired-pat", fetchFn });

    expect(result.status).toBe("failed");
    expect(result.items).toHaveLength(0);
  });
});

describe("fetchAllSources health", () => {
  test("reports per-source health so a broken pipe is not read as no news", async () => {
    const data = await fetchAllSources({ fetchFn: blockedFetch(403), stealthRun: failingStealth });

    expect(data.health.github.status).toBe("failed");
    expect(data.health.reddit.status).toBe("failed");
    expect(data.health.hackernews.status).toBe("failed");
  });

  test("keeps the item arrays at the top level for the brief payload", async () => {
    const data = await fetchAllSources({ fetchFn: blockedFetch(403), stealthRun: failingStealth });

    expect(Array.isArray(data.hn)).toBe(true);
    expect(Array.isArray(data.reddit)).toBe(true);
    expect(Array.isArray(data.github)).toBe(true);
    expect(Array.isArray(data.stealth)).toBe(true);
  });

  test("fetchAllSources exposes an independent stealth tier", async () => {
    const data = await fetchAllSources({ fetchFn: blockedFetch(403), stealthRun: failingStealth });
    expect(data.health.stealth).toBeDefined();
    expect(Array.isArray(data.stealth)).toBe(true);
  });

  test("reddit items arrive via the stealth runner, not fetchFn", async () => {
    const redditBody = `<div class=" thing link" data-fullname="t3_r1" data-subreddit="LocalLLaMA"
        data-permalink="/r/LocalLLaMA/comments/r1/x/" data-score="2" data-comments-count="0"
        data-timestamp="1000" data-promoted="false">
        <a data-event-action="title" href="/r/LocalLLaMA/comments/r1/x/">Via stealth</a></div>`;
    const stealthRun = async (urls: string[]) =>
      urls.map((url) => ({ url, status: 200, body: url.includes("reddit") ? redditBody : "", error: null }));
    const data = await fetchAllSources({ fetchFn: blockedFetch(403), stealthRun });
    expect(data.reddit.some((i) => i.id === "reddit:r1")).toBe(true);
    expect(data.health.reddit.status).toBe("ok");
  });

  // Regression: the 2026-07-10 production failure. GitHub's token expired and
  // Reddit started blocking, but both returned [] and twelve HN-only briefs
  // shipped without anyone noticing.
  test("mixed failure keeps healthy sources and still flags the broken ones", async () => {
    const hnPayload = JSON.stringify({
      hits: [
        {
          objectID: "1",
          title: "Archon v2",
          url: "https://example.invalid/a",
          points: 90,
          num_comments: 5,
          created_at_i: 1,
        },
      ],
    });
    const ghPayload = JSON.stringify({
      items: [
        {
          full_name: "coleam00/Archon",
          description: "agent builder",
          html_url: "https://example.invalid/gh",
          stargazers_count: 42,
          pushed_at: "2026-07-20T00:00:00Z",
        },
      ],
    });

    const fetchFn = (async (url: string, init?: RequestInit) => {
      const h = (init?.headers ?? {}) as Record<string, string>;
      if (url.includes("algolia")) return new Response(hnPayload, { status: 200 });
      if (url.includes("reddit")) return new Response("blocked", { status: 403 });
      if (h.Authorization) return new Response("Bad credentials", { status: 401 });
      return new Response(ghPayload, { status: 200 });
    }) as unknown as typeof fetch;

    const data = await fetchAllSources({ token: "expired-pat", fetchFn, stealthRun: failingStealth });

    expect(data.health.hackernews.status).toBe("ok");
    expect(data.health.reddit.status).toBe("failed");
    // The expired token must degrade GitHub to unauthenticated, not zero it out.
    expect(data.health.github.status).toBe("ok");
    expect(data.health.github.note).toContain("401");
    expect(data.github.length).toBeGreaterThan(0);
  });
});
