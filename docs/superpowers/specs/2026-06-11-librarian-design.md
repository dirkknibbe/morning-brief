# The Librarian — research library loop (design)

**Date:** 2026-06-11
**Status:** validated with Dirk via brainstorming (5 AskUserQuestion rounds + 4-section design approval)
**Prerequisite:** PR #9 (`fix/run-trigger-failure-detection`) merged — action-research reliability underpins this loop.

## Problem

Some of the brief's daily "Action today" items are research-reads, e.g. briefs/2026-06-10.md:

> *Action today:* Read withlore.ai's gateway + recall-tool design — it's the closest live
> blueprint for the MCPAASTA distribution model you want for UIPE. Map their pricing wedge
> onto your micropayment rails.

Today these produce nothing durable. action-research (when it runs) writes a one-shot dossier
to `actions/<date>-<slug>.md` that nothing downstream ever reads — synthesize is internal-only
(clusters Mongo `ideas`; deliberately no external fetches), so research evaporates instead of
compounding. Empirically: `actions/` has no dossiers after 2026-06-08; the withlore.ai read
never happened.

## Decisions (with rationale)

1. **Identity: evolve action-research, not a new loop.** action-research already parses the
   action item, classifies it (research / build-plan / human), runs a capped research loop, and
   writes a structured dossier. The Librarian is its back half: distill → file → index → feed
   synthesize. No new launchd job (avoids the RunAtLoad/dedupe surface), no router — the
   existing step-2 classification is the routing. Rejected: separate loop (two overlapping
   research toolchains + a router problem), full replacement (churn; build/human items don't
   belong in a research library).
2. **Storage: repo `library/*.md` canonical + Mongo index.** Markdown in git is greppable,
   PR-reviewable, and survives Atlas outages (we've had several). A Mongo `library` collection
   holds metadata + summary + embedding + path — the machine-queryable index synthesize uses.
   Git is the source of truth; Mongo is rebuildable (`bun run library reindex`).
3. **Entry shape: separate `library/<topic-slug>.md`, distinct from dossiers.** The dossier
   stays the date-keyed, human-facing run report ("5-minute read for Dirk"). The library entry
   is topic-keyed reference knowledge written for future agents. Re-reading the same artifact
   updates the existing entry (dedupe falls out of topic keying); dated run history stays in
   `actions/`, linked via the entry's `runs` list.
4. **Synthesize integration: grounding at judgment time, not candidate generation.** Synthesize's
   per-cluster step asks `bun run library relevant` for top-K matching entries, reads them as
   grounding, and records the refs it actually used as `library_refs` on the synthesis idea —
   provenance flows to triage and factory. Rejected for v1: adding `library/` to extract-ideas'
   scan (it already scans `briefs/` + `actions/`) — that reduces knowledge to idea-shaped lines
   and risks echo-clusters crowding the 10-cluster cap. Revisit after observing real entries.
5. **Cadence: rides the existing 07:00 action-research slot.** No new trigger. Delivery rides
   the existing Discord ping (one added line). The `/read` slash command is deferred to v1.1.

## Data flow

```
06:30  brief lands (generator untouched)
07:00  action-research (existing launchd job, post-PR#9 run-trigger):
         1. parse action            — hardened parse-action.ts (see Components)
         2. classify                — existing: research | build-plan | human
         3. research loop           — existing, ≤12 fetches, bun run web/reddit
         4. dossier                 — existing: actions/<date>-<slug>.md
         5. NEW distill             — library/<topic-slug>.md (research + build-plan runs;
                                      human-classified runs skip 5-6)
         6. NEW index               — bun run library upsert library/<slug>.md
         7. ping                    — existing bun run send + line: "📚 filed: library/<slug>.md"
         8. commit + push           — existing step, now also adds library/
07:25  synthesize: per cluster → bun run library relevant --text "<cluster titles+theses>" --k 3
         → agent reads genuinely-relevant entry .md files → judgment grounded
         → insert-synthesis --library-refs <slugs actually used>
07:30  triage: unchanged (library_refs ride along on the idea doc)
build  factory: build prompt includes the content of the idea's library_refs entries
```

**Invariants**
- `library/` is topic-keyed; re-reads update in place. Before creating an entry the agent
  checks `bun run library list` (or `ls library/`) and updates the existing slug if the topic
  matches.
- extract-ideas does NOT scan `library/` (deliberate; see decision 4).
- Git is the source of truth; Mongo index is rebuildable.
- No new launchd jobs; no plist changes in this work (RunAtLoad removal is its own small PR).

## Components

### `library/<slug>.md` entry format

```markdown
---
slug: withlore-ai-gateway            # ^[a-z0-9-]+$, topic/artifact-derived, stable
title: Lore.AI agent-memory gateway
summary: <2-3 sentences — used verbatim in `relevant` output>
tags: [mcp-distribution, agent-memory, pricing]   # free-form kebab-case; embedding does retrieval, tags are for humans/grep
sources: [<urls>]
first_read: 2026-06-12
last_updated: 2026-06-12
runs: [actions/2026-06-12-withlore-gateway-read.md]
---

## What it is
## Design & architecture notes        <- the reference-grade meat, claims cited to sources
## Patterns worth stealing            <- applicability to UIPE / MCPAASTA / current projects
## Open questions
```

Guidance: dense, ≤800 words. On re-reads, merge and update sections — don't append forever.

### `src/library.ts` — `bun run library <cmd>` (registered in package.json like `ideas`)

- `upsert <path>` — parse frontmatter + body, validate (slug regex, required fields), embed
  entry text (title + summary + body) via the existing local embedding path (embeddings.ts —
  no API calls, works headless), upsert Mongo `library` by slug.
- `relevant --text <t> [--k 3]` — embed query, cosine against collection, print top-K
  `{slug, title, path, score, summary}` JSON. Exit 0 with `[]` on empty library.
- `list` — slugs + titles + last_updated (for agents checking before creating entries).
- `reindex` — walk `library/*.md`, upsert all. Recovery + backfill helper.

Mongo `library` collection (`$jsonSchema` via scripts/init-db.ts): unique `slug`, `title`,
`summary`, `tags[]`, `sources[]`, `path`, `embedding[]`, `first_read`, `last_updated`,
`runs[]`, `schema_version`.

### `src/parse-action.ts` hardening (existing-code fix the loop depends on)

`parse-action.ts:33`'s `/i` flag matches lowercase "today" in brief prose — on 2026-06-05 it
captured mid-paragraph garbage and exited 0 (HIGH recurrence risk per gotchas). Fix: anchor the
marker at line start (optional emoji prefix), require the word "action" inside the bold span,
and require a colon in/after it. Case-insensitivity STAYS — the live `🎯 *Today's action:*`
variant is lowercase, so the originally-floated "drop `/i`" would break real briefs. Regression
tests on the real 2026-06-05 false-match shape plus both live marker variants.

### Trigger prompt edits

- `triggers/action-research.md` — add steps 5-6 (distill, upsert) + ping line; fix stale
  "Telegram" wording (sends go to Discord since the migration). Distill rule: research and
  build-plan classifications file entries; human skips. Budget unchanged — distill reuses
  research already in context, no extra fetches.
- `triggers/synthesize.md` — add the grounding step. The CLI returns top-3 with scores; the
  agent reads only entries that look genuinely relevant and cites the ones actually used.
  Grounding is best-effort: if `library relevant` fails or returns nothing, proceed ungrounded
  (today's behavior).
- `triggers/factory.md` — when the idea doc carries `library_refs`, read those entries and
  include them in build context.

### `insert-synthesis --library-refs` (ideas CLI)

Optional comma-separated flag (matches the `--parents` house style). Slug format validated hard (`^[a-z0-9-]+$`); existence in the library
collection checked soft (warn, don't fail — refs are provenance, not foreign keys).
**Must-verify during implementation:** the `ideas` collection `$jsonSchema` runs in error mode
(the 2026-05-11 minLength gotcha) — confirm it tolerates the new optional `library_refs` field
or update the schema + collMod in init-db.ts first, BEFORE the first write.

### Backfill (one-time, supervised)

Interactive session distills the 6 existing dossiers (2026-05-15 … 2026-06-08) into entries +
`reindex`. Doubles as the distill step's smoke test on known inputs before it runs unattended.

## Error handling

- **Mongo down at upsert:** entry .md is already written and committed — research is never
  lost. Upsert failure logs + warns in the Discord ping; `reindex` heals later.
- **`library relevant` failure in synthesize:** best-effort grounding; proceed ungrounded, log.
- **parse-action garbage:** hardened parser exits non-zero → existing step-1 error ping.
- **Dedupe/launchd:** no marker changes; rides post-PR#9 semantics. Manual re-runs still use
  `SKIP_DEDUPE=1`.

## Testing & acceptance

- **Unit** (match the existing `src/__tests__/` harness): library upsert (new + update-by-slug),
  relevant ranking sanity, malformed frontmatter rejection, reindex idempotence; parse-action
  regression suite (06-05 garbage case, both live marker variants, no-action → exit 1).
  80%+ on new TS.
- **Integration:** backfill produces 6 entries; `relevant` returns sensible matches against the
  backfilled corpus.
- **Live acceptance:** `SKIP_DEDUPE=1` action-research run against briefs/2026-06-10.md — the
  evaporated withlore.ai read becomes a real entry end-to-end (dossier + library entry + Mongo
  doc + Discord ping + rehearsal commit). Then one synthesize run: verify a cluster grounds on
  it and `library_refs` lands on the synthesis idea.

## Rollout order

1. Merge PR #9 (decide the stray local `35fbd0f` on that branch first).
2. Implementation PR to `main`: code + trigger edits + tests + this spec.
3. Merge `main` → `rehearsal` (merge commit, never fast-forward/reset — convention).
4. Supervised backfill on `rehearsal` (library content is data → lands on rehearsal like
   briefs/dossiers; code lives on main).
5. Live acceptance run (above), then watch the next scheduled 07:00 run.

## Deferred (v1.1+)

- `/read <url|topic>` Discord command (daemon → ephemeral worker, same pattern as `/build`).
- extract-ideas scanning `library/` (echo-cluster risk; revisit with real entries).
- Brief generator citing the library at write time.
- Entry aging/refresh policy; semantic-similarity reinforcement for signal_strength.
