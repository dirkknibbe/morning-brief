// src/stealth-targets.ts — curated target lists for the stealth fetch tier.
//
// NOTE: `redditTarget` is a builder, not a precomputed list. sources.ts owns
// SUBREDDITS and maps it through `redditTarget` itself — this file must NOT
// import from sources.ts. sources.ts already imports from this file, and a
// top-level `SUBREDDITS.map(...)` computed *here* would create an ESM import
// cycle that throws (`ReferenceError: Cannot access 'SUBREDDITS' before
// initialization`) because static imports resolve before either module's own
// top-level code runs. Confirmed by repro; see task-6-report.md.

import type { StealthSpec } from "./stealth-source.ts";

// Reddit: scrape each subreddit's HTML listing through the browser (JSON is 403).
export const redditTarget = (sub: string): StealthSpec => ({
  url: `https://old.reddit.com/r/${sub}/`,
  label: `reddit/r/${sub}`,
  parse: "reddit-html",
});

// Blogs: server-rendered, feed-less — plain fetch (spike-confirmed 2026-08-20).
export const BLOG_TARGETS: StealthSpec[] = [
  { url: "https://www.anthropic.com/engineering", label: "anthropic/engineering", parse: "html-list", linkPrefix: "/engineering/" },
  { url: "https://www.anthropic.com/news", label: "anthropic/news", parse: "html-list", linkPrefix: "/news/" },
];
