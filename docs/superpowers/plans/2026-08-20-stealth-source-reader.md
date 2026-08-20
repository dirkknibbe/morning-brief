# Stealth Source Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lightweight "stealthy GET" source tier that reads block-prone sources (Reddit and server-rendered blogs) past TLS/UA-fingerprint 403s without a browser, built on Scrapling's static `Fetcher`.

**Architecture:** A thin Python CLI (`scripts/stealth-fetch.py`) does stealthy GETs and returns raw bodies as JSON; all parsing, ID assignment, and health live in TypeScript (`src/stealth-source.ts`) and fold into the existing `fetchAllSources` pipeline and PR #13 health machinery.

**Tech Stack:** Bun + TypeScript (existing), Python 3 + `scrapling[fetchers]` (new, no browser), Bun-native `HTMLRewriter` for HTML parsing (no new JS dep).

**Spec:** `docs/superpowers/specs/2026-08-20-stealth-source-reader-design.md`

## Global Constraints

- **No browser.** Static `Fetcher` only; no `scrapling install`, no Chromium/Lightpanda, no `StealthyFetcher`/`DynamicFetcher`.
- **Python stays thin.** `stealth-fetch.py` does GET + JSON out, nothing else. No parsing in Python.
- **Reuse existing shapes.** Produce `RawItem` (from `src/sources.ts`) and return `FetchResult` (`{items, status, note?}`); reuse `sourceStatus()` and `redditId()` from `src/sources.ts`. Do not duplicate them.
- **Immutability / project style.** New objects, no mutation of inputs; files < 400 lines; `camelCase` fns, `PascalCase` types.
- **No Claude co-author trailer** on any commit.
- **Test runner:** `bun test`. **Typecheck:** `bunx tsc --noEmit` is ground truth.

---

### Task 1: Verify gating assumptions (light install + Reddit-403 premise)

Both risky premises get checked before any code is built on them. This task writes no product code; its deliverable is a go/no-go note.

**Files:**
- None (verification only). Record findings in the PR description / commit message.

- [ ] **Step 1: Install fetchers extra, no browser**

```bash
python3 -m pip install "scrapling[fetchers]"
```

- [ ] **Step 2: Confirm static Fetcher works WITHOUT a browser download**

```bash
python3 -c "from scrapling.fetchers import Fetcher; r = Fetcher.get('https://example.com', impersonate='chrome'); print('OK', r.status)"
```
Expected: `OK 200`. If it raises `ModuleNotFoundError` for a browser or demands `scrapling install`, STOP — the "no browser" premise is broken; report back before continuing.

- [ ] **Step 3: Confirm `impersonate` clears the Reddit 403**

```bash
python3 -c "from scrapling.fetchers import Fetcher; r = Fetcher.get('https://old.reddit.com/r/LocalLLaMA/hot.json?limit=5', impersonate='chrome'); print('reddit', r.status)"
```
Expected: `reddit 200`. **If this is 403:** Reddit migration (Task 7) is dropped from scope — note it, and the plan ships with Anthropic as the only live stealth source. Everything else proceeds unchanged.

- [ ] **Step 4: Record the outcome** (no commit needed; capture the two status codes for the PR body).

---

### Task 2: The thin Python CLI (`scripts/stealth-fetch.py`)

**Files:**
- Create: `scripts/stealth-fetch.py`

**Interfaces:**
- Produces (stdout contract, consumed by Task 5): a JSON array `[{"url": str, "status": int, "body": str, "error": str|null}]`. Reads newline-delimited URLs on stdin. Exits non-zero only on total failure (e.g. scrapling import fails).

- [ ] **Step 1: Write the script**

```python
#!/usr/bin/env python3
"""Thin stealthy GET. Reads URLs (one per line) on stdin, prints a JSON array
of {url, status, body, error} on stdout. No parsing — that lives in TypeScript."""
import sys, json

def main() -> int:
    try:
        from scrapling.fetchers import Fetcher
    except Exception as e:  # import/env failure = tool broken, not a per-URL error
        print(f"scrapling import failed: {e}", file=sys.stderr)
        return 1
    urls = [ln.strip() for ln in sys.stdin if ln.strip()]
    out = []
    for url in urls:
        try:
            r = Fetcher.get(url, impersonate="chrome", stealthy_headers=True,
                            timeout=30, retries=3)
            out.append({"url": url, "status": r.status, "body": r.body, "error": None})
        except Exception as e:
            out.append({"url": url, "status": 0, "body": "", "error": str(e)})
    json.dump(out, sys.stdout)
    return 0

if __name__ == "__main__":
    sys.exit(main())
```
Note: `r.body` is Scrapling's raw response text. If the installed version exposes text differently (e.g. `r.text`), adjust here only — the TS contract is unaffected.

- [ ] **Step 2: Smoke test against a live URL** (needs network + Task 1 install)

```bash
printf 'https://example.com\n' | python3 scripts/stealth-fetch.py | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['status'], len(d[0]['body']))"
```
Expected: `200 <nonzero>`. Confirms the stdin→JSON contract.

- [ ] **Step 3: Commit**

```bash
git add scripts/stealth-fetch.py
git commit -m "feat(stealth): thin Scrapling static-Fetcher CLI (stdin URLs -> JSON)"
```

---

### Task 3: HTML list parser (`parseHtmlList`)

**Files:**
- Create: `src/stealth-source.ts`
- Create: `src/__tests__/stealth-source.test.ts`

**Interfaces:**
- Produces (consumed by Task 5): `parseHtmlList(html: string, opts: { linkPrefix: string; origin: string }): Promise<Array<{ title: string; url: string }>>` — collects `<a href^=linkPrefix>` anchors, using anchor text as title, resolving `href` against `origin`, de-duped by URL. (Simplification of the spec's generic selectors: a link-prefix match covers the seed target — Anthropic's `/engineering/…` and `/news/…` article anchors — with far less config. Generalize to full selectors only if a later source needs it.)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import { parseHtmlList } from "../stealth-source.ts";

describe("parseHtmlList", () => {
  const html = `
    <a href="/engineering/harnesses"><h3>Effective harnesses</h3><span>Nov 26 2025</span></a>
    <a href="/engineering/postmortem"><h3>A postmortem</h3></a>
    <a href="/about">About</a>
    <a href="/engineering/harnesses"><h3>Effective harnesses</h3></a>`;

  test("extracts prefix-matching anchors as {title,url}, absolute + deduped", async () => {
    const out = await parseHtmlList(html, {
      linkPrefix: "/engineering/",
      origin: "https://www.anthropic.com",
    });
    expect(out).toEqual([
      { title: "Effective harnesses Nov 26 2025", url: "https://www.anthropic.com/engineering/harnesses" },
      { title: "A postmortem", url: "https://www.anthropic.com/engineering/postmortem" },
    ]);
  });

  test("ignores non-matching anchors and empty-text anchors", async () => {
    const out = await parseHtmlList(`<a href="/engineering/x"></a><a href="/news/y">Y</a>`, {
      linkPrefix: "/engineering/",
      origin: "https://www.anthropic.com",
    });
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/__tests__/stealth-source.test.ts`
Expected: FAIL — `parseHtmlList` not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/stealth-source.ts

export async function parseHtmlList(
  html: string,
  opts: { linkPrefix: string; origin: string },
): Promise<Array<{ title: string; url: string }>> {
  const out: Array<{ title: string; url: string }> = [];
  const seen = new Set<string>();
  let current: { href: string; text: string } | null = null;

  const rewriter = new HTMLRewriter().on(`a[href^="${opts.linkPrefix}"]`, {
    element(el) {
      const href = el.getAttribute("href") ?? "";
      current = { href, text: "" };
      el.onEndTag(() => {
        if (!current) return;
        const title = current.text.trim().replace(/\s+/g, " ");
        const url = new URL(current.href, opts.origin).href;
        if (title && !seen.has(url)) {
          seen.add(url);
          out.push({ title, url });
        }
        current = null;
      });
    },
    text(t) {
      if (current) current.text += t.text;
    },
  });

  await rewriter.transform(new Response(html)).text();
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/__tests__/stealth-source.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add src/stealth-source.ts src/__tests__/stealth-source.test.ts
git commit -m "feat(stealth): HTMLRewriter-based prefix link-list parser"
```

---

### Task 4: Extract the shared Reddit mapping (`mapRedditChild`)

Refactor the inline Reddit post→`RawItem` mapping in `src/sources.ts` into one shared pure function, so both the legacy path and the stealth path produce identical items.

**Files:**
- Modify: `src/sources.ts` (the two mapping blocks inside `fetchReddit`)
- Modify: `src/__tests__/sources.test.ts` (add mapping test)

**Interfaces:**
- Produces (consumed by Task 5 and by `fetchReddit`): `mapRedditChild(child: any, fallbackSub: string): RawItem | null` — returns null when `child.data` is missing; otherwise maps the Reddit post to a `RawItem` using `redditId(post.id)`, `sourceLabel = \`reddit/r/${post.subreddit ?? fallbackSub}\``. Does NOT apply the `stickied` skip or dedupe (callers keep that).

- [ ] **Step 1: Write the failing test**

```ts
// add to src/__tests__/sources.test.ts
import { mapRedditChild } from "../sources.ts";

describe("mapRedditChild", () => {
  test("maps a post to a RawItem with reddit id and permalink url", () => {
    const item = mapRedditChild(
      { data: { id: "abc", subreddit: "LocalLLaMA", title: "T", permalink: "/r/LocalLLaMA/comments/abc/t/", score: 9, num_comments: 3, selftext: "body", created_utc: 100 } },
      "fallback",
    );
    expect(item).toEqual({
      id: "reddit:abc",
      source: "reddit",
      sourceLabel: "reddit/r/LocalLLaMA",
      title: "T",
      url: "https://reddit.com/r/LocalLLaMA/comments/abc/t/",
      score: 9,
      comments: 3,
      summary: "body",
      timestamp: 100,
    });
  });

  test("returns null when data is missing", () => {
    expect(mapRedditChild({}, "x")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/__tests__/sources.test.ts`
Expected: FAIL — `mapRedditChild` not exported.

- [ ] **Step 3: Add the function and route both existing loops through it**

Add to `src/sources.ts` (near the Reddit section):

```ts
export function mapRedditChild(child: any, fallbackSub: string): RawItem | null {
  const post = child?.data;
  if (!post) return null;
  return {
    id: redditId(post.id),
    source: "reddit",
    sourceLabel: `reddit/r/${post.subreddit ?? fallbackSub}`,
    title: post.title,
    url: `https://reddit.com${post.permalink}`,
    score: post.score,
    comments: post.num_comments,
    summary: post.selftext?.slice(0, 300) || undefined,
    timestamp: post.created_utc,
  };
}
```

Then in `fetchReddit`, replace each inline `items.push({...})` block with:

```ts
for (const child of data?.data?.children ?? []) {
  const post = child.data;
  if (!post || post.stickied) continue;          // hot loop keeps the stickied skip
  const item = mapRedditChild(child, sub);
  if (!item || seen.has(item.id)) continue;
  seen.add(item.id);
  items.push(item);
}
```
For the search loop, drop the `post.stickied` check (matches current behavior) and pass the loop's `sub` as fallback.

- [ ] **Step 4: Run tests to verify pass (mapping + no Reddit regression)**

Run: `bun test src/__tests__/sources.test.ts`
Expected: PASS, including the existing `fetchReddit` 403 test.

- [ ] **Step 5: Commit**

```bash
git add src/sources.ts src/__tests__/sources.test.ts
git commit -m "refactor(sources): extract shared mapRedditChild mapping"
```

---

### Task 5: `fetchStealth` wrapper + config types

**Files:**
- Modify: `src/stealth-source.ts`
- Modify: `src/__tests__/stealth-source.test.ts`

**Interfaces:**
- Consumes: `parseHtmlList` (Task 3), `mapRedditChild` (Task 4), `RawItem`/`FetchResult`/`sourceStatus` (from `src/sources.ts`).
- Produces (consumed by Task 6):
  - `interface StealthSpec { url: string; label: string; parse: "reddit-json" | "html-list"; linkPrefix?: string }`
  - `type StealthRunner = (urls: string[]) => Promise<Array<{ url: string; status: number; body: string; error?: string | null }>>`
  - `fetchStealth(specs: StealthSpec[], deps?: { run?: StealthRunner }): Promise<FetchResult>` — spawns the Python CLI by default; `deps.run` injects a fake in tests.

- [ ] **Step 1: Write the failing test**

```ts
import { fetchStealth, type StealthSpec } from "../stealth-source.ts";

describe("fetchStealth", () => {
  const specs: StealthSpec[] = [
    { url: "https://old.reddit.com/r/LocalLLaMA/hot.json", label: "reddit/r/LocalLLaMA", parse: "reddit-json" },
    { url: "https://www.anthropic.com/engineering", label: "anthropic/engineering", parse: "html-list", linkPrefix: "/engineering/" },
  ];

  test("parses each source and reports ok health", async () => {
    const run = async () => [
      { url: specs[0].url, status: 200, body: JSON.stringify({ data: { children: [
        { data: { id: "z", subreddit: "LocalLLaMA", title: "Reddit post", permalink: "/r/x/z/", score: 5, num_comments: 1, created_utc: 1 } },
      ] } }) },
      { url: specs[1].url, status: 200, body: `<a href="/engineering/harnesses"><h3>Harnesses</h3></a>` },
    ];
    const res = await fetchStealth(specs, { run });
    expect(res.status).toBe("ok");
    expect(res.items.map((i) => i.id)).toEqual(["reddit:z", expect.stringMatching(/^stealth:/)]);
  });

  test("all-failed sources report failed, not empty", async () => {
    const run = async () => specs.map((s) => ({ url: s.url, status: 403, body: "", error: "blocked" }));
    const res = await fetchStealth(specs, { run });
    expect(res.status).toBe("failed");
    expect(res.items).toHaveLength(0);
  });

  test("partial failure keeps good items and notes the bad one", async () => {
    const run = async () => [
      { url: specs[0].url, status: 200, body: JSON.stringify({ data: { children: [] } }) },
      { url: specs[1].url, status: 403, body: "", error: "blocked" },
    ];
    const res = await fetchStealth(specs, { run });
    expect(res.note).toContain("1/2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/__tests__/stealth-source.test.ts`
Expected: FAIL — `fetchStealth` not exported.

- [ ] **Step 3: Implement the wrapper and default runner**

Add to `src/stealth-source.ts` (import the shared pieces from `./sources.ts`):

```ts
import {
  type RawItem,
  type FetchResult,
  sourceStatus,
  mapRedditChild,
} from "./sources.ts";

export interface StealthSpec {
  url: string;
  label: string;
  parse: "reddit-json" | "html-list";
  linkPrefix?: string;
}

export type StealthRunner = (
  urls: string[],
) => Promise<Array<{ url: string; status: number; body: string; error?: string | null }>>;

// Stable id for html-list items (no natural id like reddit has).
const stealthId = (url: string) =>
  "stealth:" + new Bun.CryptoHasher("sha1").update(url).digest("hex").slice(0, 16);

async function spawnStealthCli(urls: string[]) {
  const proc = Bun.spawn(["python3", "scripts/stealth-fetch.py"], {
    stdin: new TextEncoder().encode(urls.join("\n")),
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = await new Response(proc.stdout).text();
  const code = await proc.exited;
  if (code !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`stealth-fetch.py exited ${code}: ${err.trim()}`);
  }
  return JSON.parse(out);
}

export async function fetchStealth(
  specs: StealthSpec[],
  deps: { run?: StealthRunner } = {},
): Promise<FetchResult> {
  const run = deps.run ?? spawnStealthCli;
  let results: Awaited<ReturnType<StealthRunner>>;
  try {
    results = await run(specs.map((s) => s.url));
  } catch (e) {
    return { items: [], status: "failed", note: (e as Error).message };
  }

  const byUrl = new Map(results.map((r) => [r.url, r]));
  const items: RawItem[] = [];
  let errors = 0;

  for (const spec of specs) {
    const r = byUrl.get(spec.url);
    if (!r || r.error || r.status >= 400 || !r.body) {
      errors++;
      continue;
    }
    try {
      if (spec.parse === "reddit-json") {
        const data = JSON.parse(r.body);
        for (const child of data?.data?.children ?? []) {
          const item = mapRedditChild(child, spec.label.replace(/^reddit\/r\//, ""));
          if (item) items.push(item);
        }
      } else {
        const links = await parseHtmlList(r.body, {
          linkPrefix: spec.linkPrefix ?? "/",
          origin: new URL(spec.url).origin,
        });
        for (const l of links) {
          items.push({
            id: stealthId(l.url),
            source: "stealth", // requires Source union extension — see Step 4
            sourceLabel: spec.label,
            title: l.title,
            url: l.url,
          });
        }
      }
    } catch {
      errors++;
    }
  }

  return {
    items,
    status: sourceStatus({ items: items.length, errors, attempts: specs.length }),
    note: errors ? `${errors}/${specs.length} stealth sources failed` : undefined,
  };
}
```

- [ ] **Step 4: Add `"stealth"` to the `Source` union, run tests + typecheck**

In `src/sources.ts` extend: `export type Source = "hackernews" | "reddit" | "github" | "stealth";`
Run: `bun test src/__tests__/stealth-source.test.ts && bunx tsc --noEmit`
Expected: PASS, tsc clean. (Without the union change, tsc rejects `source: "stealth"` — that failure is the reminder.)

- [ ] **Step 5: Commit**

```bash
git add src/stealth-source.ts src/__tests__/stealth-source.test.ts src/sources.ts
git commit -m "feat(stealth): fetchStealth wrapper with injected runner + health"
```

---

### Task 6: Wire into `fetchAllSources` and the CLI summary

**Files:**
- Modify: `src/sources.ts` (`FetchDeps`, `fetchAllSources`, CLI `import.meta.main` block)
- Create: `src/stealth-targets.ts` (the curated spec list)
- Modify: `src/__tests__/sources.test.ts`

**Interfaces:**
- Consumes: `fetchStealth`, `StealthSpec`, `StealthRunner` (Task 5).
- Produces: `fetchAllSources` accepts `deps.stealthRun?: StealthRunner`, returns an added `stealth: RawItem[]` array and a `health.stealth` entry; CLI summary `counts` + `failed_sources` include stealth.

- [ ] **Step 1: Create the curated target list**

```ts
// src/stealth-targets.ts
import type { StealthSpec } from "./stealth-source.ts";

// Server-rendered, feed-less (spike-confirmed 2026-08-20). Add block-prone
// sources here; Reddit is added by Task 7 only if the 403 premise held.
export const STEALTH_TARGETS: StealthSpec[] = [
  { url: "https://www.anthropic.com/engineering", label: "anthropic/engineering", parse: "html-list", linkPrefix: "/engineering/" },
  { url: "https://www.anthropic.com/news", label: "anthropic/news", parse: "html-list", linkPrefix: "/news/" },
];
```

- [ ] **Step 2: Write the failing test (health includes stealth)**

```ts
// add to src/__tests__/sources.test.ts — reuse the existing blockedFetch helper
test("fetchAllSources includes stealth health", async () => {
  const data = await fetchAllSources({
    fetchFn: blockedFetch(403),
    stealthRun: async () => [], // no stealth results
  });
  expect(data.health.stealth).toBeDefined();
  expect(Array.isArray(data.stealth)).toBe(true);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test src/__tests__/sources.test.ts`
Expected: FAIL — `health.stealth` undefined / `stealthRun` not accepted by `FetchDeps`.

- [ ] **Step 4: Wire it in**

In `src/sources.ts`:
- Add to `FetchDeps`: `stealthRun?: StealthRunner;` (import `StealthRunner` + `fetchStealth` from `./stealth-source.ts`, `STEALTH_TARGETS` from `./stealth-targets.ts`).
- Add the fourth settled source:

```ts
const [hn, reddit, github, stealth] = await Promise.allSettled([
  fetchHackerNews(deps),
  fetchReddit(deps),
  fetchGitHub(deps),
  fetchStealth(STEALTH_TARGETS, { run: deps.stealthRun }),
]);
```
- Add `stealth: settled(stealth).items` to the returned object and `stealth: health(settled(stealth))` to the `health` map. `health` is keyed by `Source`, which already includes `"stealth"` (Task 5) — no signature change needed.
- In the `import.meta.main` block, add `stealth: data.stealth.length` to `counts`. The `failed_sources` scan already iterates `Object.keys(data.health)`, so stealth is included automatically.

- [ ] **Step 5: Run tests + typecheck**

Run: `bun test && bunx tsc --noEmit`
Expected: full suite PASS, tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/sources.ts src/stealth-targets.ts src/__tests__/sources.test.ts
git commit -m "feat(stealth): wire stealth tier into fetchAllSources + CLI summary"
```

---

### Task 7: Reddit migration (CONDITIONAL on Task 1 Step 3)

**Skip this task entirely if Task 1 Step 3 returned 403.** In that case add a one-line note to the PR that Reddit stays on the legacy path, and stop here.

**Files:**
- Modify: `src/sources.ts` (export `SUBREDDITS`; drop `fetchReddit` from the aggregate)
- Modify: `src/stealth-targets.ts` (add Reddit specs)
- Modify: `src/__tests__/sources.test.ts`

- [ ] **Step 1: Add Reddit specs to the stealth targets**

Export `SUBREDDITS` from `src/sources.ts` (`export const SUBREDDITS = [...]`), then in `src/stealth-targets.ts`:

```ts
import { SUBREDDITS } from "./sources.ts";

for (const sub of SUBREDDITS) {
  STEALTH_TARGETS.push({
    url: `https://old.reddit.com/r/${sub}/hot.json?limit=10&t=day`,
    label: `reddit/r/${sub}`,
    parse: "reddit-json",
  });
}
```

- [ ] **Step 2: Write the failing test — reddit now flows through the stealth runner**

```ts
test("reddit items arrive via the stealth runner", async () => {
  const data = await fetchAllSources({
    fetchFn: blockedFetch(403), // legacy reddit path blocked
    stealthRun: async (urls) =>
      urls.map((url) => ({
        url,
        status: 200,
        body: url.includes("reddit")
          ? JSON.stringify({ data: { children: [{ data: { id: "r1", subreddit: "LocalLLaMA", title: "Via stealth", permalink: "/r/x/r1/", score: 2, num_comments: 0, created_utc: 1 } }] } })
          : "<html></html>",
      })),
  });
  expect(data.stealth.some((i) => i.id === "reddit:r1")).toBe(true);
  expect(data.reddit.some((i) => i.id === "reddit:r1")).toBe(true);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test src/__tests__/sources.test.ts`
Expected: FAIL — reddit item not present (legacy `fetchReddit` is blocked and stealth reddit isn't wired to the top-level `reddit` array yet).

- [ ] **Step 4: Serve Reddit from the stealth tier (avoid double-fetch)**

In `fetchAllSources`, drop `fetchReddit(deps)` from the `Promise.allSettled` list and source the top-level `reddit` array from the stealth results:

```ts
const [hn, github, stealth] = await Promise.allSettled([
  fetchHackerNews(deps),
  fetchGitHub(deps),
  fetchStealth(STEALTH_TARGETS, { run: deps.stealthRun }),
]);
const stealthItems = settled(stealth).items;
// ...
return {
  hn: settled(hn).items,
  reddit: stealthItems.filter((i) => i.source === "reddit"), // ponytail: reddit moved to stealth tier
  github: settled(github).items,
  stealth: stealthItems,
  health: {
    hackernews: health(settled(hn)),
    reddit: health(settled(stealth)),   // reddit health = stealth-tier health (its fetcher)
    github: health(settled(github)),
    stealth: health(settled(stealth)),
  },
};
```
Keep `fetchReddit` exported (still unit-tested) but unused by the aggregate; add a comment `// ponytail: kept for the legacy/manual path; aggregate now uses the stealth tier`.

- [ ] **Step 5: Run tests + typecheck**

Run: `bun test && bunx tsc --noEmit`
Expected: PASS, tsc clean. The existing `fetchReddit` 403 unit test still passes (function unchanged); the aggregate no longer depends on it.

- [ ] **Step 6: Commit**

```bash
git add src/stealth-targets.ts src/sources.ts src/__tests__/sources.test.ts
git commit -m "feat(stealth): route Reddit through the stealth tier"
```

---

### Task 8: Docs + scheduled-env verification

**Files:**
- Modify: `README.md`
- Modify: `triggers/scheduled-brief.md`

- [ ] **Step 1: Document the dependency + failure mode**

In `README.md`, add a "Stealth source tier" note: requires `python3` + `pip install "scrapling[fetchers]"` on the box (no browser); the brief degrades with a `failed_sources` warning if Python/scrapling is missing (it does not silently drop — see PR #13 health).

- [ ] **Step 2: Note the tier in the trigger prompt**

In `triggers/scheduled-brief.md` step 1, add that `failed_sources` may now include `stealth` and that its `note` will name the cause (e.g. "python3 not found" or a per-URL failure count).

- [ ] **Step 3: Verify in the ACTUAL scheduled environment**

The weeks of FAILED briefs came from the scheduler's env lacking `.env`; the same class of gap applies to `python3`/scrapling. Confirm the launchd run can reach them under the same PATH `run-trigger.sh` exports:

```bash
env -i PATH="$HOME/.bun/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin" \
  python3 -c "import scrapling; print('scrapling ok')"
```
Expected: `scrapling ok`. If not, install scrapling into the interpreter that PATH resolves, or prepend its location to `run-trigger.sh`'s PATH export. Record the result in the PR.

- [ ] **Step 4: Commit**

```bash
git add README.md triggers/scheduled-brief.md
git commit -m "docs(stealth): document python/scrapling dependency + scheduled-env check"
```

---

## Self-Review

**Spec coverage:** thin Python CLI (T2) ✓; TS-only parsing (T3 html, T4 reddit map, T5 wrapper) ✓; `FetchResult`/health reuse (T5, T6) ✓; source config (T6) ✓; Reddit migration conditional on the 403 premise (T1→T7) ✓; light-install + Reddit-premise verifies (T1) ✓; dedupe via stable ids (T4 reddit id, T5 `stealthId`) ✓; scheduled-env dependency check (T8) ✓; deferred `StealthyFetcher`/Lightpanda — no task, correct ✓.

**Placeholder scan:** no TBD/TODO. The `source: "stealth"` value in Task 5 Step 3 is defined by the union extension in the same task's Step 4 (tsc failure is the built-in reminder). No "similar to Task N" — code is repeated where needed.

**Type consistency:** `StealthSpec`, `StealthRunner`, `FetchResult`, `RawItem`, `sourceStatus`, `mapRedditChild`, `parseHtmlList`, `stealthId` names/signatures match across T3–T7. `Source` union extended once (T5 Step 4) and consumed (T5, T6). `deps.stealthRun` (T6) threads into `fetchStealth`'s `deps.run` (T5). Reddit health keyed to the stealth fetcher's status after T7 (documented in T7 Step 4).
