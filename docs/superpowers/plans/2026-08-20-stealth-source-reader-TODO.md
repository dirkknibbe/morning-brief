# Stealth Source Reader — Implementation TODO / Issues

Issues + architecture revisions surfaced during subagent-driven execution of
`2026-08-20-stealth-source-reader.md`. Newest first.

## RESOLVED → ARCHITECTURE REVISION (2026-08-20 evening)

**Task 1 gate ran live. The static-`Fetcher` premise failed; user ruled to
escalate to `StealthyFetcher`. The plan below is REVISED accordingly — read
this before executing any task.**

Empirical matrix (tested on the box, `scrapling[fetchers]` + `scrapling install`):

| Fetcher | reddit `.json` | reddit HTML | example.com |
|---|---|---|---|
| static `Fetcher(impersonate='chrome')` | 403 | 403 | 200 |
| `StealthyFetcher.fetch(headless=True)` | 403 | **200 (38–76 posts)** | — |

**Revisions to the plan (supersede the original task text where they conflict):**

1. **Global constraint "No browser" is REVERSED.** The tier now REQUIRES the
   Camoufox/patchright browser (`pip install "scrapling[fetchers]"` +
   `scrapling install`, already done on this box). Update the plan's Global
   Constraints and Task 8 docs accordingly.

2. **`scripts/stealth-fetch.py` uses `StealthyFetcher`, not static `Fetcher`.**
   Same stdin→JSON `{url,status,body,error}` contract. **Use one
   `StealthySession` for the whole batch** (browser reuse) — do NOT launch a
   browser per URL; ~9 subreddits × per-fetch browser would be intolerably slow.
   Sketch:
   ```python
   from scrapling.fetchers import StealthySession
   with StealthySession(headless=True) as s:
       for url in urls:
           p = s.fetch(url)            # reuses the one browser
           out.append({"url": url, "status": p.status, "body": p.body, "error": None})
   ```

3. **Reddit parse mode changes `reddit-json` → `reddit-html`.** Reddit `.json`
   is 403 even under the browser; scrape the HTML page instead. New parser:
   CSS `a[href*="/comments/"]` → each is a post; title = link text, url = href,
   id = `reddit:` + the `/comments/<id>/` segment (dedupe on it). Task 4's
   `mapRedditChild` (JSON-shaped) is replaced by this HTML parser. Target URLs
   become `https://old.reddit.com/r/<sub>/` (HTML), not `.../hot.json`.

4. **Task 7 (Reddit migration) is REINSTATED** — it works now, via #2 + #3.

5. **Anthropic stays plain `fetch`** (server-rendered; no browser needed).
   Decide during implementation whether to route it through the same
   StealthySession for uniformity or keep it on Bun `fetch` (lighter — prefer
   the latter unless it complicates the code).

6. **Performance caveat (NEW, must handle):** `StealthyFetcher` is
   seconds-per-page. Cap the subreddit count and/or run the stealth batch with a
   generous timeout; the fetch stage will be much slower than the current
   all-`fetch` pipeline. Consider fetching Reddit less often than HN/GitHub.

**Verify-items status:** light-install ✓ (done); Reddit-premise ✓ *resolved*
(static fails, StealthyFetcher-HTML works). No further gating probes needed.

## Notes

- `parseHtmlList` (Task 3, HTMLRewriter) is still useful for Anthropic; the
  Reddit HTML parser is a separate `reddit-html` mode (different selector shape).
- Environment friction: context-mode hook redirects inline HTTP to
  `ctx_execute`; GateGuard fact-forces file writes. Run network/install/probe
  steps in the controller via `ctx_execute(python)` — subagents will trip on
  these.
- Session state: spec + plan + this TODO committed on `feat/stealth-source-reader`
  (pushed). PR #13 (source health) already merged to main. Nothing of the
  stealth tier is implemented yet.
