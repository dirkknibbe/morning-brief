# Stealth Source Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **⚠ REVISED 2026-08-20 (evening).** Task 1's live gate reversed the original
> "no browser / static `Fetcher`" premise. This plan is the CURRENT source of
> truth; where it conflicts with the spec, the plan wins. Rationale + empirical
> matrix: `2026-08-20-stealth-source-reader-TODO.md`.

**Goal:** Add a "stealthy GET" source tier that reads block-prone sources past TLS/UA-fingerprint 403s. **Reddit** is read by scraping its HTML through one Camoufox browser session (`StealthySession`); **Anthropic** blogs are read with a plain Bun `fetch` (server-rendered, no browser needed). All parsing, ID assignment, and health live in TypeScript and fold into the existing `fetchAllSources` pipeline + PR #13 health machinery.

**Architecture (revised):**

```
fetchAllSources (src/sources.ts)
  ├── fetchHackerNews / fetchGitHub          ← unchanged (plain fetch, APIs)
  ├── fetchStealth(REDDIT_TARGETS, {run})    ← reddit-html: browser via Python CLI
  │        └── scripts/stealth-fetch.py  (one StealthySession for the whole batch)
  │                 → [{url,status,body,error}] → parseRedditHtml → RawItem[] (source "reddit")
  └── fetchStealth(BLOG_TARGETS,  {fetchFn}) ← html-list: plain Bun fetch
           → parseHtmlList → RawItem[] (source "stealth")
```

Two separate `fetchStealth` calls keep Reddit and blog health **independent** — a dead browser must not be masked by healthy blogs, and vice-versa.

**Tech Stack:** Bun + TypeScript (existing), Python 3 + `scrapling[fetchers]` + `scrapling install` (Camoufox browser — required), Bun-native `HTMLRewriter` for HTML parsing (no new JS dep).

**Spec:** `docs/superpowers/specs/2026-08-20-stealth-source-reader-design.md` (static-Fetcher premise superseded — see banner above).

## Global Constraints

- **Browser required.** Reddit needs Camoufox: `pip install "scrapling[fetchers]"` + `scrapling install` (both already done on this box). Anthropic does NOT — it uses plain `fetch`.
- **One `StealthySession` per batch.** The Python CLI reuses ONE browser for all Reddit URLs — never a browser per URL (~8 subreddits × per-fetch launch would be intolerably slow). `StealthySession` is seconds-per-page; keep the subreddit count modest and give the spawn a generous timeout.
- **Python stays thin.** `stealth-fetch.py` does browser GET + JSON out, nothing else. No parsing in Python.
- **Reuse existing shapes.** Produce `RawItem`, return `FetchResult` (`{items, status, note?}`); reuse `sourceStatus()` and `redditId()` from `src/sources.ts`. Do not duplicate them.
- **Immutability / project style.** New objects, no mutation of inputs; files < 400 lines; `camelCase` fns, `PascalCase` types.
- **No Claude co-author trailer** on any commit. Commit types: `feat`/`refactor`/`docs`.
- **Test runner:** `bun test`. **Typecheck:** `bunx tsc --noEmit` is ground truth.
- **Work in the `feat/stealth-source-reader` worktree** at `/private/tmp/stealth-wt`. `cd` there for all `git`/`bun` commands.

---

### Task 1: Verify gating assumptions — ✅ DONE (see TODO)

Ran live. Static `Fetcher` fails Reddit (403 on both `.json` and HTML); `StealthySession.fetch` clears Reddit HTML (200, ~25 posts/page). Anthropic returns 200 server-rendered HTML on a plain GET. Premises resolved — no further gating probes. **Do not re-run.**

---

### Task 2: The thin Python CLI (`scripts/stealth-fetch.py`)

**Files:**
- Create: `scripts/stealth-fetch.py`

**Interfaces:**
- Produces (stdout contract, consumed by Task 5): a JSON array `[{"url": str, "status": int, "body": str, "error": str|null}]`. Reads newline-delimited URLs on stdin. Uses ONE `StealthySession` for the whole batch. Exits non-zero only on total failure (scrapling import fails).

- [ ] **Step 1: Write the script**

```python
#!/usr/bin/env python3
"""Thin stealthy browser GET. Reads URLs (one per line) on stdin, prints a JSON
array of {url, status, body, error} on stdout. ONE StealthySession for the whole
batch (browser reuse). No parsing — that lives in TypeScript."""
import sys, json

def main() -> int:
    try:
        from scrapling.fetchers import StealthySession
    except Exception as e:  # import/env failure = tool broken, not a per-URL error
        print(f"scrapling import failed: {e}", file=sys.stderr)
        return 1

    urls = [ln.strip() for ln in sys.stdin if ln.strip()]
    out = []
    try:
        with StealthySession(headless=True) as s:
            for url in urls:
                try:
                    p = s.fetch(url)
                    body = p.body
                    if isinstance(body, (bytes, bytearray)):  # StealthySession returns bytes
                        body = body.decode("utf-8", "replace")
                    out.append({"url": url, "status": int(p.status or 0),
                                "body": body or "", "error": None})
                except Exception as e:
                    out.append({"url": url, "status": 0, "body": "", "error": str(e)})
    except Exception as e:  # browser could not launch at all
        print(f"StealthySession failed to start: {e}", file=sys.stderr)
        return 1

    json.dump(out, sys.stdout)
    return 0

if __name__ == "__main__":
    sys.exit(main())
```
Note: `p.body` is bytes under `StealthySession` (verified) — the `decode` guard is load-bearing. The TS contract is unaffected.

- [ ] **Step 2: Smoke test against a live URL** — CONTROLLER-RUN ONLY.

The controller (not a subagent) runs this; the browser + network + hooks make it unsuitable for a subagent. Expected: a subreddit page returns `200` with a body containing `data-fullname="t3_`.
```bash
cd /private/tmp/stealth-wt
printf 'https://old.reddit.com/r/LocalLLaMA/\n' | python3 scripts/stealth-fetch.py \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['status'], 'data-fullname' in d[0]['body'])"
```
Expected: `200 True`.

- [ ] **Step 3: Commit**

```bash
cd /private/tmp/stealth-wt
git add scripts/stealth-fetch.py
git commit -m "feat(stealth): thin Scrapling StealthySession CLI (stdin URLs -> JSON)"
```

---

### Task 3: HTML list parser (`parseHtmlList`) — for Anthropic

**Files:**
- Create: `src/stealth-source.ts`
- Create: `src/__tests__/stealth-source.test.ts`

**Interfaces:**
- Produces (consumed by Task 5): `parseHtmlList(html: string, opts: { linkPrefix: string; origin: string }): Promise<Array<{ title: string; url: string }>>` — collects `<a href^=linkPrefix>` anchors, using anchor text as title, resolving `href` against `origin`, de-duped by URL. Covers Anthropic's `/engineering/…` and `/news/…` article anchors.

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

- [ ] **Step 2: Run test to verify it fails** — `bun test src/__tests__/stealth-source.test.ts` → FAIL (`parseHtmlList` not exported).

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

- [ ] **Step 4: Run test to verify it passes** — `bun test src/__tests__/stealth-source.test.ts` → PASS (both).

- [ ] **Step 5: Commit**

```bash
cd /private/tmp/stealth-wt
git add src/stealth-source.ts src/__tests__/stealth-source.test.ts
git commit -m "feat(stealth): HTMLRewriter-based prefix link-list parser"
```

---

### Task 4: Reddit HTML parser (`parseRedditHtml`)

**Replaces the original plan's `mapRedditChild` (JSON).** Reddit `.json` is 403 even under the browser; we scrape the `old.reddit.com/r/<sub>/` HTML page instead. Every field lives in `data-*` attributes on `div.thing` (verified against the live page) — so this is near full-fidelity (only `selftext`/summary is lost, which the listing page doesn't carry).

Real structure (observed 2026-08-20):
```html
<div class=" thing id-t3_1voojjz linkflair odd stickied link self"
     data-fullname="t3_1voojjz" data-subreddit="LocalLLaMA"
     data-permalink="/r/LocalLLaMA/comments/1voojjz/megathread_.../"
     data-timestamp="1786754473000" data-comments-count="391" data-score="490"
     data-promoted="false" ...>
  <a class="title may-blank" data-event-action="title"
     href="/r/LocalLLaMA/comments/1voojjz/megathread_.../">Post Title Text</a>
</div>
```

**Files:**
- Modify: `src/stealth-source.ts`
- Modify: `src/__tests__/stealth-source.test.ts`

**Interfaces:**
- Produces (consumed by Task 5): `parseRedditHtml(html: string): Promise<RawItem[]>` — one `RawItem` per non-stickied, non-promoted `div.thing`. `id = redditId(dataFullname without "t3_")`; `title` from the `a[data-event-action="title"]` text; `url = "https://reddit.com" + data-permalink`; `sourceLabel = "reddit/r/" + data-subreddit`; `score`/`comments`/`timestamp` from `data-score`/`data-comments-count`/`data-timestamp` (timestamp is ms → floor to seconds). De-dupes by id within a page.

- [ ] **Step 1: Write the failing test** (add to `src/__tests__/stealth-source.test.ts`)

```ts
import { parseRedditHtml } from "../stealth-source.ts";

describe("parseRedditHtml", () => {
  const html = `
    <div class=" thing id-t3_aaa odd link self" data-fullname="t3_aaa"
         data-subreddit="LocalLLaMA" data-permalink="/r/LocalLLaMA/comments/aaa/first_post/"
         data-timestamp="1786754473000" data-comments-count="12" data-score="42" data-promoted="false">
      <a class="title may-blank" data-event-action="title"
         href="/r/LocalLLaMA/comments/aaa/first_post/">First post</a>
    </div>
    <div class=" thing id-t3_bbb even link stickied self" data-fullname="t3_bbb"
         data-subreddit="LocalLLaMA" data-permalink="/r/LocalLLaMA/comments/bbb/mega/"
         data-timestamp="1786000000000" data-comments-count="99" data-score="500" data-promoted="false">
      <a class="title may-blank" data-event-action="title"
         href="/r/LocalLLaMA/comments/bbb/mega/">Sticky megathread</a>
    </div>
    <div class=" thing id-t3_ccc odd promotedlink" data-fullname="t3_ccc"
         data-subreddit="ads" data-permalink="/r/ads/comments/ccc/ad/"
         data-score="0" data-promoted="true">
      <a class="title may-blank" data-event-action="title"
         href="/r/ads/comments/ccc/ad/">An ad</a>
    </div>`;

  test("maps non-stickied non-promoted posts to full RawItems", async () => {
    const out = await parseRedditHtml(html);
    expect(out).toEqual([
      {
        id: "reddit:aaa",
        source: "reddit",
        sourceLabel: "reddit/r/LocalLLaMA",
        title: "First post",
        url: "https://reddit.com/r/LocalLLaMA/comments/aaa/first_post/",
        score: 42,
        comments: 12,
        timestamp: 1786754473,
      },
    ]);
  });

  test("skips stickied and promoted posts", async () => {
    const out = await parseRedditHtml(html);
    expect(out.map((i) => i.id)).toEqual(["reddit:aaa"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `bun test src/__tests__/stealth-source.test.ts` → FAIL (`parseRedditHtml` not exported).

- [ ] **Step 3: Write the implementation** (add to `src/stealth-source.ts`; import `RawItem` + `redditId` from `./sources.ts`)

```ts
import { type RawItem, redditId } from "./sources.ts";

const num = (v: string | null): number | undefined =>
  v == null || v === "" ? undefined : Number(v);

export async function parseRedditHtml(html: string): Promise<RawItem[]> {
  const out: RawItem[] = [];
  const seen = new Set<string>();
  let cur:
    | { fullname: string; permalink: string; sub: string; score?: number;
        comments?: number; ts?: number; skip: boolean; title: string }
    | null = null;

  const rewriter = new HTMLRewriter()
    .on('div.thing[data-fullname^="t3_"]', {
      element(el) {
        const cls = el.getAttribute("class") ?? "";
        cur = {
          fullname: el.getAttribute("data-fullname") ?? "",
          permalink: el.getAttribute("data-permalink") ?? "",
          sub: el.getAttribute("data-subreddit") ?? "",
          score: num(el.getAttribute("data-score")),
          comments: num(el.getAttribute("data-comments-count")),
          ts: num(el.getAttribute("data-timestamp")),
          skip: el.getAttribute("data-promoted") === "true" || /\bstickied\b/.test(cls),
          title: "",
        };
        el.onEndTag(() => {
          const c = cur;
          cur = null;
          if (!c || c.skip) return;
          const id = redditId(c.fullname.replace(/^t3_/, ""));
          const title = c.title.trim().replace(/\s+/g, " ");
          if (!title || seen.has(id)) return;
          seen.add(id);
          out.push({
            id,
            source: "reddit",
            sourceLabel: `reddit/r/${c.sub}`,
            title,
            url: `https://reddit.com${c.permalink}`,
            score: c.score,
            comments: c.comments,
            timestamp: c.ts != null ? Math.floor(c.ts / 1000) : undefined,
          });
        });
      },
    })
    .on('a[data-event-action="title"]', {
      text(t) {
        if (cur) cur.title += t.text;
      },
    });

  await rewriter.transform(new Response(html)).text();
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes** — `bun test src/__tests__/stealth-source.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
cd /private/tmp/stealth-wt
git add src/stealth-source.ts src/__tests__/stealth-source.test.ts
git commit -m "feat(stealth): old.reddit HTML post parser (data-* attrs)"
```

---

### Task 5: `fetchStealth` wrapper + config types + `Source` union

**Files:**
- Modify: `src/stealth-source.ts`
- Modify: `src/__tests__/stealth-source.test.ts`
- Modify: `src/sources.ts` (extend `Source` union)

**Interfaces:**
- Consumes: `parseHtmlList` (T3), `parseRedditHtml` (T4), `RawItem`/`FetchResult`/`sourceStatus` (from `src/sources.ts`).
- Produces (consumed by Task 6):
  - `interface StealthSpec { url: string; label: string; parse: "reddit-html" | "html-list"; linkPrefix?: string }`
  - `type StealthRunner = (urls: string[]) => Promise<Array<{ url: string; status: number; body: string; error?: string | null }>>`
  - `fetchStealth(specs: StealthSpec[], deps?: { run?: StealthRunner; fetchFn?: typeof fetch }): Promise<FetchResult>` — `reddit-html` specs are fetched as ONE batch through `run` (Python browser CLI; default spawns it); `html-list` specs are fetched individually via `fetchFn` (plain Bun `fetch`, default `fetch`). Both parse into one combined `FetchResult`; callers pass homogeneous spec lists so each call's health is source-specific.

- [ ] **Step 1: Write the failing test** (add to `src/__tests__/stealth-source.test.ts`)

```ts
import { fetchStealth, type StealthSpec, type StealthRunner } from "../stealth-source.ts";

describe("fetchStealth", () => {
  const redditSpecs: StealthSpec[] = [
    { url: "https://old.reddit.com/r/LocalLLaMA/", label: "reddit/r/LocalLLaMA", parse: "reddit-html" },
  ];
  const blogSpecs: StealthSpec[] = [
    { url: "https://www.anthropic.com/engineering", label: "anthropic/engineering", parse: "html-list", linkPrefix: "/engineering/" },
  ];
  const redditBody = `<div class=" thing link" data-fullname="t3_z" data-subreddit="LocalLLaMA"
      data-permalink="/r/LocalLLaMA/comments/z/x/" data-score="5" data-comments-count="1"
      data-timestamp="1000" data-promoted="false">
      <a data-event-action="title" href="/r/LocalLLaMA/comments/z/x/">Reddit post</a></div>`;

  test("reddit-html specs fetch via run() and parse posts", async () => {
    const run: StealthRunner = async (urls) => urls.map((url) => ({ url, status: 200, body: redditBody, error: null }));
    const res = await fetchStealth(redditSpecs, { run });
    expect(res.status).toBe("ok");
    expect(res.items.map((i) => i.id)).toEqual(["reddit:z"]);
    expect(res.items[0].source).toBe("reddit");
  });

  test("html-list specs fetch via fetchFn and get stealth ids", async () => {
    const fetchFn = (async () =>
      new Response(`<a href="/engineering/harnesses"><h3>Harnesses</h3></a>`, { status: 200 })) as unknown as typeof fetch;
    const res = await fetchStealth(blogSpecs, { fetchFn });
    expect(res.status).toBe("ok");
    expect(res.items[0].id).toMatch(/^stealth:/);
    expect(res.items[0].source).toBe("stealth");
    expect(res.items[0].sourceLabel).toBe("anthropic/engineering");
  });

  test("all-failed sources report failed, not empty", async () => {
    const run: StealthRunner = async (urls) => urls.map((url) => ({ url, status: 403, body: "", error: "blocked" }));
    const res = await fetchStealth(redditSpecs, { run });
    expect(res.status).toBe("failed");
    expect(res.items).toHaveLength(0);
  });

  test("a thrown browser batch is failed with the error in note", async () => {
    const run: StealthRunner = async () => { throw new Error("python3 not found"); };
    const res = await fetchStealth(redditSpecs, { run });
    expect(res.status).toBe("failed");
    expect(res.note).toContain("python3 not found");
  });

  test("partial failure keeps good items and notes the bad one", async () => {
    const specs = [...blogSpecs, { url: "https://www.anthropic.com/news", label: "anthropic/news", parse: "html-list", linkPrefix: "/news/" } as StealthSpec];
    const fetchFn = (async (url: string) =>
      url.includes("/news")
        ? new Response("blocked", { status: 403 })
        : new Response(`<a href="/engineering/x"><h3>X</h3></a>`, { status: 200 })) as unknown as typeof fetch;
    const res = await fetchStealth(specs, { fetchFn });
    expect(res.items).toHaveLength(1);
    expect(res.note).toContain("1/2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `bun test src/__tests__/stealth-source.test.ts` → FAIL (`fetchStealth` not exported).

- [ ] **Step 3: Implement the wrapper + default browser runner** (add to `src/stealth-source.ts`; extend the `./sources.ts` import to also bring in `type FetchResult` and `sourceStatus`)

```ts
import { type RawItem, type FetchResult, redditId, sourceStatus } from "./sources.ts";

export interface StealthSpec {
  url: string;
  label: string;
  parse: "reddit-html" | "html-list";
  linkPrefix?: string;
}

export type StealthRunner = (
  urls: string[],
) => Promise<Array<{ url: string; status: number; body: string; error?: string | null }>>;

// Stable id for html-list items (no natural id like reddit's fullname).
const stealthId = (url: string) =>
  "stealth:" + new Bun.CryptoHasher("sha1").update(url).digest("hex").slice(0, 16);

async function spawnStealthCli(urls: string[]) {
  const proc = Bun.spawn(["python3", "scripts/stealth-fetch.py"], {
    stdin: new TextEncoder().encode(urls.join("\n")),
    stdout: "pipe",
    stderr: "pipe",
    cwd: import.meta.dir + "/..", // repo root, so the script path resolves regardless of caller cwd
  });
  const out = await new Response(proc.stdout).text();
  const code = await proc.exited;
  if (code !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`stealth-fetch.py exited ${code}: ${err.trim()}`);
  }
  return JSON.parse(out) as Awaited<ReturnType<StealthRunner>>;
}

export async function fetchStealth(
  specs: StealthSpec[],
  deps: { run?: StealthRunner; fetchFn?: typeof fetch } = {},
): Promise<FetchResult> {
  const bodies = new Map<string, { status: number; body: string; error?: string | null }>();
  let batchError: string | undefined;

  const browserSpecs = specs.filter((s) => s.parse === "reddit-html");
  const plainSpecs = specs.filter((s) => s.parse === "html-list");

  if (browserSpecs.length) {
    const run = deps.run ?? spawnStealthCli;
    try {
      for (const r of await run(browserSpecs.map((s) => s.url))) bodies.set(r.url, r);
    } catch (e) {
      batchError = (e as Error).message;
    }
  }

  const doFetch = deps.fetchFn ?? fetch;
  await Promise.all(
    plainSpecs.map(async (s) => {
      try {
        const res = await doFetch(s.url);
        bodies.set(s.url, {
          status: res.status,
          body: res.ok ? await res.text() : "",
          error: res.ok ? null : `HTTP ${res.status}`,
        });
      } catch (e) {
        bodies.set(s.url, { status: 0, body: "", error: String(e) });
      }
    }),
  );

  const items: RawItem[] = [];
  const seen = new Set<string>();
  let errors = 0;

  for (const spec of specs) {
    const r = bodies.get(spec.url);
    if (!r || r.error || r.status >= 400 || !r.body) {
      errors++;
      continue;
    }
    try {
      const parsed =
        spec.parse === "reddit-html"
          ? await parseRedditHtml(r.body)
          : (
              await parseHtmlList(r.body, {
                linkPrefix: spec.linkPrefix ?? "/",
                origin: new URL(spec.url).origin,
              })
            ).map(
              (l): RawItem => ({
                id: stealthId(l.url),
                source: "stealth",
                sourceLabel: spec.label,
                title: l.title,
                url: l.url,
              }),
            );
      for (const it of parsed) {
        if (seen.has(it.id)) continue;
        seen.add(it.id);
        items.push(it);
      }
    } catch {
      errors++;
    }
  }

  return {
    items,
    status: sourceStatus({ items: items.length, errors, attempts: specs.length }),
    note: batchError ?? (errors ? `${errors}/${specs.length} stealth sources failed` : undefined),
  };
}
```

- [ ] **Step 4: Add `"stealth"` to the `Source` union, run tests + typecheck**

In `src/sources.ts`: `export type Source = "hackernews" | "reddit" | "github" | "stealth";`
Run: `cd /private/tmp/stealth-wt && bun test src/__tests__/stealth-source.test.ts && bunx tsc --noEmit`
Expected: PASS, tsc clean. (Without the union change, tsc rejects `source: "stealth"` — that failure is the reminder.)

- [ ] **Step 5: Commit**

```bash
cd /private/tmp/stealth-wt
git add src/stealth-source.ts src/__tests__/stealth-source.test.ts src/sources.ts
git commit -m "feat(stealth): fetchStealth wrapper (browser reddit + plain-fetch blogs) + health"
```

---

### Task 6: Wire into `fetchAllSources` — Reddit via stealth, blogs as new tier, delete legacy Reddit

**Files:**
- Create: `src/stealth-targets.ts` (curated spec lists)
- Modify: `src/sources.ts` (`FetchDeps`, `fetchAllSources`, CLI block; export `SUBREDDITS`; delete legacy Reddit JSON path)
- Modify: `src/__tests__/sources.test.ts`

**Interfaces:**
- Consumes: `fetchStealth`, `StealthSpec`, `StealthRunner` (T5).
- Produces: `fetchAllSources` accepts `deps.stealthRun?: StealthRunner`; `data.reddit` now comes from the stealth tier; adds `data.stealth: RawItem[]` and `health.stealth`; CLI `counts`/`top` include stealth.

- [ ] **Step 1: Create the curated target lists**

```ts
// src/stealth-targets.ts
import type { StealthSpec } from "./stealth-source.ts";
import { SUBREDDITS } from "./sources.ts";

// Reddit: scrape each subreddit's HTML listing through the browser (JSON is 403).
export const REDDIT_TARGETS: StealthSpec[] = SUBREDDITS.map((sub) => ({
  url: `https://old.reddit.com/r/${sub}/`,
  label: `reddit/r/${sub}`,
  parse: "reddit-html",
}));

// Blogs: server-rendered, feed-less — plain fetch (spike-confirmed 2026-08-20).
export const BLOG_TARGETS: StealthSpec[] = [
  { url: "https://www.anthropic.com/engineering", label: "anthropic/engineering", parse: "html-list", linkPrefix: "/engineering/" },
  { url: "https://www.anthropic.com/news", label: "anthropic/news", parse: "html-list", linkPrefix: "/news/" },
];
```

- [ ] **Step 2: Write the failing tests** (in `src/__tests__/sources.test.ts`)

First, a shared helper near the top (after `blockedFetch`):
```ts
// Reddit now flows through the stealth browser tier, never fetchFn — every
// fetchAllSources test MUST inject stealthRun or it will spawn the real Python CLI.
const failingStealth = async (urls: string[]) =>
  urls.map((url) => ({ url, status: 403, body: "", error: "blocked" }));
```

Then add:
```ts
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
```

- [ ] **Step 3: Run tests to verify they fail** — `bun test src/__tests__/sources.test.ts` → FAIL (`stealthRun` not on `FetchDeps`; `data.stealth`/`health.stealth` undefined).

- [ ] **Step 4: Wire it in and delete the legacy Reddit path** (`src/sources.ts`)

1. **Export `SUBREDDITS`**: change `const SUBREDDITS` → `export const SUBREDDITS`.
2. **Delete** the entire legacy Reddit JSON machinery: `REDDIT_SEARCHES`, `redditFetch`, and `fetchReddit` (all now dead — `.json` is 403 with no working fallback). Keep `redditId` (still used by `parseRedditHtml`).
3. **Import** at top: `import { fetchStealth, type StealthRunner } from "./stealth-source.ts";` and `import { REDDIT_TARGETS, BLOG_TARGETS } from "./stealth-targets.ts";`
4. **Add to `FetchDeps`**: `stealthRun?: StealthRunner;`
5. **Rewrite the aggregate** — two homogeneous stealth calls:

```ts
export async function fetchAllSources(deps: FetchDeps = {}): Promise<{
  hn: RawItem[];
  reddit: RawItem[];
  github: RawItem[];
  stealth: RawItem[];
  health: Record<Source, SourceHealth>;
}> {
  const [hn, github, reddit, stealth] = await Promise.allSettled([
    fetchHackerNews(deps),
    fetchGitHub(deps),
    fetchStealth(REDDIT_TARGETS, { run: deps.stealthRun, fetchFn: deps.fetchFn }),
    fetchStealth(BLOG_TARGETS, { run: deps.stealthRun, fetchFn: deps.fetchFn }),
  ]);
  const results = {
    hackernews: settled(hn),
    github: settled(github),
    reddit: settled(reddit),
    stealth: settled(stealth),
  };
  return {
    hn: results.hackernews.items,
    reddit: results.reddit.items,
    github: results.github.items,
    stealth: results.stealth.items,
    health: {
      hackernews: health(results.hackernews),
      reddit: health(results.reddit),
      github: health(results.github),
      stealth: health(results.stealth),
    },
  };
}
```

6. **CLI block** (`import.meta.main`): add `data.stealth` to the summary-truncation loop; add `stealth: data.stealth.length` to `counts`; add `stealth: data.stealth.slice(0,3).map(...)` to `top`. `failed_sources` already scans `Object.keys(data.health)`, so stealth + reddit are included automatically.

- [ ] **Step 5: Fix the existing `fetchAllSources` tests to inject `stealthRun`**

The legacy `fetchReddit` `describe` block and its import are gone (function deleted) — remove them. Every existing `fetchAllSources(...)` call must add `stealthRun: failingStealth` (or a purpose-built runner) so no test spawns the real CLI:
- "reports per-source health…": add `stealthRun: failingStealth`; it still asserts `data.health.reddit.status === "failed"` (reddit 403 via the runner) — intent preserved.
- "keeps the item arrays…": add `stealthRun: failingStealth`; also assert `Array.isArray(data.stealth)`.
- "mixed failure keeps healthy sources…": add `stealthRun: failingStealth` (reddit stays failed via the runner; `fetchFn` still drives HN/GitHub). Keep the HN-ok / reddit-failed / github-ok assertions.

- [ ] **Step 6: Run full suite + typecheck** — `cd /private/tmp/stealth-wt && bun test && bunx tsc --noEmit` → all PASS, tsc clean.

- [ ] **Step 7: Commit**

```bash
cd /private/tmp/stealth-wt
git add src/sources.ts src/stealth-targets.ts src/__tests__/sources.test.ts
git commit -m "feat(stealth): route Reddit through stealth tier, add blog tier, drop legacy Reddit JSON"
```

---

### Task 7: Docs + scheduled-env verification

**Files:**
- Modify: `README.md`
- Modify: `triggers/scheduled-brief.md`

- [ ] **Step 1: Document the dependency + failure mode** — In `README.md`, add a "Stealth source tier" note: Reddit + Anthropic blogs read through a browser/plain-fetch tier; requires `python3` + `pip install "scrapling[fetchers]"` + `scrapling install` (Camoufox browser) on the box for Reddit specifically; Anthropic needs only Bun. If Python/scrapling/browser is missing, `health.reddit` degrades to `failed` with a `note` (it does not silently drop — PR #13 health). Note it is seconds-per-page, so Reddit is the slow leg.

- [ ] **Step 2: Note the tier in the trigger prompt** — In `triggers/scheduled-brief.md` step 1, add that `failed_sources` may now include `reddit` (browser tier) and `stealth` (blogs), and that each `note` names the cause (e.g. "python3 not found", "StealthySession failed to start", or a per-URL failure count).

- [ ] **Step 3: Verify in the ACTUAL scheduled environment** — CONTROLLER-RUN. The weeks of FAILED briefs came from the scheduler's env lacking `.env`; the same class of gap applies to `python3`/scrapling/browser. Confirm the launchd run can reach them under the PATH `run-trigger.sh` exports:

```bash
env -i PATH="$HOME/.bun/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin" \
  python3 -c "from scrapling.fetchers import StealthySession; print('stealth ok')"
```
Expected: `stealth ok`. If not, install into the interpreter that PATH resolves, or prepend its location to `run-trigger.sh`'s PATH export. Record the result in the PR.

- [ ] **Step 4: Commit**

```bash
cd /private/tmp/stealth-wt
git add README.md triggers/scheduled-brief.md
git commit -m "docs(stealth): document python/scrapling browser dependency + scheduled-env check"
```

---

## Self-Review

**Spec coverage (revised):** thin Python CLI (T2, now `StealthySession`) ✓; TS-only parsing (T3 html-list, T4 reddit-html) ✓; `FetchResult`/health reuse (T5, T6) ✓; source config (T6 targets) ✓; Reddit migration REINSTATED via browser HTML scrape (T4→T6) ✓; dedupe via stable ids (T4 reddit id from `data-fullname`, T5 `stealthId`) ✓; independent per-source health via two homogeneous `fetchStealth` calls (T6) ✓; scheduled-env dependency check incl. browser (T7) ✓.

**Deviations from the spec (documented in the TODO):** "no browser" reversed — Reddit needs Camoufox; `reddit-json` → `reddit-html`; Anthropic on plain Bun `fetch` (not the CLI); legacy `fetchReddit` JSON path deleted (403 always, no working fallback); Reddit keyword-searches (`REDDIT_SEARCHES`) dropped (HTML scrape covers subreddit hot listings only — re-add via a search-results HTML scrape if coverage suffers).

**Type consistency:** `StealthSpec.parse` is `"reddit-html" | "html-list"` in T5 and consumed by T6 targets; `StealthRunner`, `FetchResult`, `RawItem`, `sourceStatus`, `redditId`, `parseHtmlList`, `parseRedditHtml`, `stealthId` names/signatures match across T3–T6. `Source` union extended once (T5 Step 4). `deps.stealthRun` (T6 `FetchDeps`) threads into `fetchStealth`'s `deps.run` (T5). Reddit health = its own stealth-call status; blog health = the other call's status — never shared.

**Placeholder scan:** no TBD/TODO. `source: "stealth"` (T5) is defined by the union extension in the same task's Step 4 (tsc failure is the reminder).
