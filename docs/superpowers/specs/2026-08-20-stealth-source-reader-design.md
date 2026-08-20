# Stealth Source Reader — Design Spec

> **⚠ SUPERSEDED IN PART (2026-08-20 evening).** The "no browser / static
> `Fetcher`" premise below failed Task 1's live gate. Reddit now uses a Camoufox
> `StealthySession` (HTML scrape); Anthropic uses plain Bun `fetch`. The plan is
> the current source of truth: `../plans/2026-08-20-stealth-source-reader.md`
> (+ `-TODO.md`). Read those before this file's "no browser" sections.

**Date:** 2026-08-20
**Status:** Approved design, pre-implementation
**Base:** `origin/main` @ b6d017a (after PR #13)

## Goal

Let the morning brief read from **more sources without getting blocked**, by adding a
lightweight "stealthy GET" tier that defeats the common TLS/UA-fingerprint 403 (the
kind that has been blocking Reddit) **without a browser**. Built on Scrapling's static
`Fetcher`.

## Non-goals (explicitly deferred)

- **Browser rendering / JS execution.** No Chromium, no Lightpanda. Server-rendered
  pages and JSON endpoints only.
- **`StealthyFetcher` + Camoufox (Cloudflare-hard tier).** Add only when a real
  Cloudflare-Turnstile source appears. YAGNI.
- **Cross-source synthesis / insights layer.** Separate future work.
- **Breadth feed expansion** (GitHub Atom, arXiv, HF, newsletters). Valuable but
  independent — this spec is only the anti-block fetch tier. See
  `vfs://refs/source-feeds.md` for the verified feed list when that work starts.

## Why this shape

The anti-block capability lives in Scrapling's **fetcher**, not in any browser:
static `Fetcher.get(url, impersonate='chrome')` sends a real browser TLS fingerprint
via `curl_cffi` — no browser process. This is the lightest tool that solves the stated
problem. (Full rationale + the Lightpanda rejection: `vfs://decisions/scrapling-evaluation.md`.)

Keep **Python dead-thin and all logic in TypeScript**, so the interesting, testable
parts stay where the project already lives, and the Python piece is an isolated,
swappable "stealthy GET" (replaceable by a Bun TLS-impersonation lib later with no
change to consumers).

## Architecture

```
bun run fetch (src/sources.ts)
        │
        ├── fetchHackerNews / fetchGitHub      ← unchanged (plain fetch, feeds/APIs)
        │
        └── fetchStealth (src/stealth-source.ts)
                 │  spawns, writes URLs on stdin, reads JSON on stdout
                 ▼
          scripts/stealth-fetch.py  ← Scrapling static Fetcher only
                 │  Fetcher.get(url, impersonate='chrome', stealthy_headers=True)
                 ▼
          [{url, status, body, error?}]  → parsed in TS into RawItem[]
```

### Components

**1. `scripts/stealth-fetch.py`** — the only Python. ~20 lines, no parsing.
- Reads newline-delimited URLs on **stdin** (avoids argv length limits, keeps URLs out of `ps`).
- For each: `Fetcher.get(url, impersonate="chrome", stealthy_headers=True, timeout=30, retries=3)`.
- Emits one JSON array on **stdout**: `[{url, status, body, error}]` where `body` is the
  raw response text (HTML or JSON) and `error` is a string on failure (never throws the
  whole batch — one bad URL must not sink the others).
- Exit non-zero **only** if it cannot run at all (import/env failure), so the TS layer can
  distinguish "tool broken" from "some URLs failed".

**2. `src/stealth-source.ts`** — Bun wrapper + parsers.
- `fetchStealth(specs: StealthSpec[], deps?): Promise<FetchResult>` — spawns the CLI,
  feeds URLs, awaits JSON, dispatches each result to its parser, returns the existing
  `FetchResult` shape (`{items, status, note?}`) so it drops into `fetchAllSources`
  and the PR #13 health machinery untouched.
- `deps` injection (`runFn`) mirrors the `fetchFn` pattern in `sources.ts` so tests run
  without spawning Python.

**3. Source config** — a small typed list, one entry per block-prone source:
```ts
interface StealthSpec {
  url: string;
  label: string;                 // sourceLabel, e.g. "reddit/r/LocalLLaMA"
  parse: "reddit-json" | "html-list";
  itemSelector?: string;         // html-list only: CSS for each item
  titleSelector?: string;
  linkSelector?: string;
}
```
Parsers:
- `reddit-json` — reuse the existing Reddit item mapping (the `.json` body is identical;
  only the transport changed). Factor the current mapping in `sources.ts` into a shared
  pure function so both the legacy path and this one call it.
- `html-list` — a small pure parser: given HTML + selectors, return `{title, url}[]`.
  Resolve relative links against the source origin. Seed target = Anthropic
  news/engineering (confirmed server-rendered; plain HTTP already yields `{title, date, url}`).

**4. Reddit migration.** Route Reddit through `fetchStealth` instead of the plain
`fetch` in `fetchReddit`. Premise: `impersonate='chrome'` clears the fingerprint 403.
Gated on Verify-2 below — if it does not clear, Reddit stays on the (still-broken) plain
path and this spec ships with Anthropic as the only live stealth source.

### Data flow & IDs

Every produced item keeps a stable `id` (`reddit:<postid>`, or `sha1(url)` for html-list)
so the existing Mongo `seen_items` dedupe works with zero changes. Items merge into the
same candidate pool as HN/GitHub; ranking, dedupe, themes, signals all downstream and
unchanged.

### Error handling & health

Reuses PR #13's `SourceStatus`:
- A stealth source whose every URL errored → `failed` (surfaced in `failed_sources`,
  warned in the brief + Discord).
- Some URLs failed → items from the rest, `note` records which failed.
- Python CLI unspawnable / non-zero exit → whole tier `failed` with the stderr in `note`.

## Testing

- **`html-list` parser** — pure, unit-tested: known HTML + selectors → expected
  `{title,url}[]`, including relative-link resolution and empty/missing nodes.
- **`reddit-json` mapping** — unit-tested against a captured `.json` fixture; asserts the
  refactor is behavior-preserving vs the current inline mapping.
- **`fetchStealth`** — injected `runFn` returns canned `[{url,status,body}]`; asserts
  RawItem mapping + `SourceStatus` (all-fail → failed, partial → note, ok).
- **`stealth-fetch.py`** — one manual smoke test against a live URL (needs network +
  scrapling); not in CI.
- Full `bun test` green; `tsc --noEmit` clean.

## Verify-items (early in implementation, before building parsers out)

1. **Light install.** Confirm static `Fetcher.get` works with only
   `pip install "scrapling[fetchers]"` and **no** `scrapling install` (no browser
   download). If it demands the browser, revisit dependency weight.
2. **Reddit premise.** One live `Fetcher.get(reddit_url, impersonate='chrome')` — does it
   return 200 where plain fetch got 403? This validates the entire anti-block claim. If
   it fails, Reddit migration is dropped from scope (Anthropic still ships).

## Rollout / environment

- `scripts/stealth-fetch.py` + `pip install "scrapling[fetchers]"` on the box.
- launchd/`run-trigger.sh` env needs `python3` on PATH with scrapling importable.
  Document in README; the health signal makes a missing-Python run loud, not silent.
- No secrets, no new env vars.

## Open questions (resolved)

- **MCP server vs subprocess CLI?** → subprocess CLI. Static-Fetcher use is deterministic
  pipeline code, not agent-driven scraping; CLI is testable and avoids the headless-MCP-load risk.
- **Lightpanda?** → no. It only attaches to the non-stealth `DynamicFetcher` path and
  provides zero anti-detection.
- **Parse in Python or TS?** → TS. Python stays a thin stealthy GET.
