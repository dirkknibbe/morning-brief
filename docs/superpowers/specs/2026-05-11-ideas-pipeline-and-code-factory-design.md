---
date: 2026-05-11
status: draft
author: dirk + claude
related:
  - briefs/
  - actions/
  - triggers/scheduled-brief.md
  - triggers/action-research.md
  - triggers/listener.md
---

# Ideas Pipeline + Code Factory — Design

## Philosophy

> The only thing that matters is finding the best ideas and building them until they work.

Two non-negotiables follow:

1. **"Best ideas"** — extracted from briefs and action dossiers, then ruthlessly filtered by *recurrence and concreteness*, not first-sighting. An idea that surfaces across multiple briefs is a thesis getting stronger; an idea that appears once is noise.
2. **"Built until they work"** — the factory iterates against explicit success criteria. Termination is **semantic** (done, stuck, or scope-break), not wall-clock or round-count.

## Pipeline overview

```
briefs/*.md ──┐
              ├──▶ extract ──▶ reinforce/merge ──▶ triage ──▶ ideas (Mongo: queued)
actions/*.md ─┘                                                       │
                                                          /build <slug> via Telegram
                                                                      ▼
                                                          factory (tmux RemoteTrigger)
                                                                      │
                                                  iterate: write → test → fix → repeat
                                                                      │
                                              ┌───────────────────────┼───────────────────────┐
                                              ▼                       ▼                       ▼
                                       ✅ done                  🛑 stuck               🛑 scope-break
                                  push branch +              learnings.md →           reclassify idea
                                  Telegram link              re-queue idea            (e.g., "needs paid API")
```

## Stages

### 1. Extract (`src/extract-ideas.ts`)

Scans `briefs/*.md` and `actions/*.md` end-to-end on every run (cheap; markdown).

Sources of candidate ideas:
- `💡 *Opportunity Sparks*` bullets in briefs
- `One action item` lines in briefs
- `Concrete next steps for Dirk` items in action dossiers

Output: array of `IdeaCandidate { content_hash, title, raw_text, source_brief, source_action?, theme_hints[], extracted_at }`.

Idempotent. `content_hash` = SHA256 of normalized title + first sentence.

### 2. Reinforce / merge (inside `src/extract-ideas.ts`)

For each candidate:
- Exact match on `content_hash` → increment `signal_strength`, append source.
- Semantic near-match (cosine similarity > 0.85 on title+first-sentence embedding) → merge into existing idea, append source, increment `signal_strength`. (Use `Bun`'s built-in or `@xenova/transformers` for local embeddings — no API call.)
- New → insert with `signal_strength: 1`, `status: 'extracted'`.

This is the **"best ideas surface themselves"** mechanism. No LLM needed at this stage.

### 3. Triage (`triggers/triage.md`, fires daily ~07:30)

Runs after `action-research`. Loads all `extracted` ideas with `signal_strength >= 2` (configurable; tunable after we see the data).

For each surviving idea, the agent:
1. Re-reads the source briefs/actions inline.
2. Writes **explicit success criteria** as a list of testable assertions, e.g.:
   ```
   success_criteria:
     - "CLI accepts a GitHub repo URL"
     - "outputs a JSON file with {summary, files_touched, risk_score}"
     - "passes smoke test against anthropics/claude-code repo"
   ```
   *Without these, the build loop has no termination signal. This step is non-skippable.*
3. Scores 1-5 across: **novelty**, **fits-Dirk-profile**, **buildable-without-paid-APIs**, **scope** (favors prototype-in-a-day). Composite = sum.
4. Marks top idea `queued`. Tie-breaker order: highest `signal_strength`, then most recent `extracted_at`. Others stay `extracted` for next-day re-evaluation (recurrence will boost them naturally).

Sends Telegram digest: top-3 queued ideas with scores + `/build <slug>` and `/reject <slug>` callbacks.

### 4. Factory (`triggers/factory.md`)

**Trigger**: fires on Telegram `/build <slug>` (not on a clock). Mechanism: listener detects the command, invokes `scripts/start-factory.sh <slug>`, which spawns a detached tmux session that runs `IDEA_SLUG=<slug> ./scripts/run-trigger.sh triggers/factory.md`. The factory trigger reads `$IDEA_SLUG` to know which idea to build.

**Execution context**: dedicated tmux-backed `RemoteTrigger` session. Separate from your interactive Claude Code session — they share your subscription's usage window but not session state.

**Setup steps the factory takes**:
1. Acquire Mongo `factory_lock` (single doc, errors if held). One build at a time.
2. Read the queued idea + source brief + source dossier.
3. Create worktree at `.claude/worktrees/factory/<slug>/` from `main`.
4. Invoke `superpowers:writing-plans` to draft an implementation plan against the success criteria. Commit plan as `docs/plans/<date>-<slug>.md` in the worktree.
5. Enter the iteration loop.

**Iteration loop** (each iteration = one "round"):
1. Run all success-criteria tests.
2. If all pass → **DONE**. Push branch `factory/<slug>`, send Telegram link to worktree path + branch, release lock, mark idea `built`.
3. If some fail:
   - Generate a hypothesis for the next failing test (or the smallest-failure-delta one).
   - Check stuck-detector (see below). If stuck → exit loop with `stuck` terminator.
   - Implement the hypothesis (TDD: write/extend the failing test first if missing, then make it pass).
   - Commit the round: `git commit -m "round N: <hypothesis>"`.
   - Send Telegram heartbeat: `round N — X/Y tests passing — hypothesis: <one line>`.
   - Loop.

**Stuck-detection**:
- Track per-round: `failing_test_count`, `hypothesis_text`.
- Stuck = **5 consecutive rounds** where `failing_test_count` did not decrease *and* `hypothesis_text` is semantically similar to a prior round's (cosine > 0.9 on hypothesis text). Tunable; we'll learn the right number from real runs.
- On stuck: write `learnings.md` to the worktree (rounds attempted, hypotheses tried, dead-ends), commit, push branch as `factory/<slug>-stuck`, send Telegram with `stuck after N rounds — see learnings.md`. Mark idea `parked` and decrement `signal_strength` by 1.

**Scope-break detection**:
- If during a round the agent identifies a hard requirement that violates guardrails (paid API, human action, external infra), abort the loop. Reclassify idea status to `needs_human` with the blocker recorded. No branch push.

**No iteration cap. No wall-clock cap.** Stuck-detection is the primary terminator. We'll observe behavior and add a soft cap later if runs misbehave.

### 5. Listener extensions (`triggers/listener.md`)

Extend the existing Telegram listener to recognize:

| Command | Action |
|---|---|
| `/ideas` | List top-10 `queued` and `extracted` ideas with scores. |
| `/idea <slug>` | Show full record: title, sources, signal_strength, success_criteria, learnings. |
| `/build <slug>` | Fire the factory RemoteTrigger for that slug. Refuse if lock held. |
| `/reject <slug> <reason>` | Mark idea `rejected`, store reason. Excluded from future triage. |
| `/abort <slug>` | Kill the running factory tmux session, release lock, leave worktree intact. |
| `/factory-status` | Current run: idea, round, tests passing/total, last hypothesis. |

## Data model

### `ideas` collection (Mongo)

```ts
{
  _id: ObjectId,
  slug: string,                  // kebab-case from title
  content_hash: string,          // dedup key
  title: string,
  raw_text: string,              // original extract
  sources: [
    { brief: 'briefs/2026-04-09.md', section: 'Opportunity Sparks' },
    { brief: 'briefs/2026-04-12.md', section: 'One action item' },
  ],
  signal_strength: number,       // = sources.length after dedupe
  theme_hints: string[],         // free-text, lifted from brief themes
  status: 'extracted' | 'queued' | 'building' | 'built' | 'parked' | 'rejected' | 'needs_human',
  scores: { novelty: 1-5, fit: 1-5, buildable: 1-5, scope: 1-5 } | null,
  success_criteria: string[] | null,   // populated at triage
  rejection_reason: string | null,
  learnings: string[],           // append-only across attempts
  attempts: number,              // factory runs against this idea
  created_at: Date,
  updated_at: Date,
}
```

### `factory_runs` collection

```ts
{
  _id: ObjectId,
  idea_slug: string,
  started_at: Date,
  ended_at: Date | null,
  terminator: 'done' | 'stuck' | 'scope-break' | 'aborted' | null,
  rounds: number,
  branch: string,
  worktree_path: string,
  rounds_log: [{ n, failing_test_count, hypothesis, test_output_excerpt }],
}
```

### `factory_lock` collection

Single-doc collection, holds either nothing or `{ idea_slug, started_at, pid }`. Build-start atomically inserts; build-end deletes.

## Components

| Path | Purpose |
|---|---|
| `src/extract-ideas.ts` | Scan briefs + actions, dedupe, reinforce, upsert to `ideas`. |
| `src/ideas-state.ts` | Mongo CRUD + CLI: `list`, `show <slug>`, `set-status <slug> <status>`, `learnings <slug>`. Mirrors `brief-state.ts` shape. |
| `src/factory-lock.ts` | Acquire/release/check the lock doc. |
| `triggers/triage.md` | Daily 07:30 trigger — score, criteria, queue. |
| `triggers/factory.md` | Telegram-fired trigger — the build loop itself. |
| `triggers/listener.md` | Extended with new commands (existing file, edit). |
| `scripts/loop-triggers.sh` | Existing — extend to fire `triage.md` after `action-research.md`. |
| `scripts/start-factory.sh` | New — used by listener to spawn factory tmux session on `/build`. |

## Hard guardrails

- **Worktree only**, never the main checkout. Path: `.claude/worktrees/factory/<slug>/`.
- **No `gh pr create`** without explicit Telegram confirmation. Branches are pushed; PRs are Dirk's call.
- **No deploys.** No `vercel deploy`, no `npm publish`, no `gh release`. Ever.
- **No money.** No paid API calls, no domain purchases, no plan upgrades.
- **One build at a time.** `factory_lock` enforces this.
- **TDD enforced.** The factory invokes `superpowers:test-driven-development`. No code without a failing test first.
- **Subscription, not API.** All LLM work goes through Claude Code RemoteTrigger on Dirk's subscription. No `ANTHROPIC_API_KEY` used by the factory.

## Open behaviors we'll learn from real runs

These are deliberately not pre-tuned — observe first, set later:

- The `signal_strength >= 2` triage threshold.
- The `5-round` stuck-detection window.
- Whether to add a soft iteration cap (currently: none).
- Whether triage should produce success criteria itself or hand that to a separate "criteria-writer" pass.

## Recommended phasing

The implementation plan should ship in two phases:

**Phase 1 — Ideas surface themselves.** `extract-ideas.ts`, `ideas-state.ts`, `triggers/triage.md`, listener commands `/ideas`, `/idea`, `/reject`. Add `triage.md` to `loop-triggers.sh`. Run for ~1 week. We'll see what real ideas look like, validate the dedupe/reinforce mechanism, and tune `signal_strength` threshold from observation before committing factory mechanics to the design.

**Phase 2 — The factory.** `factory-lock.ts`, `triggers/factory.md`, `scripts/start-factory.sh`, listener commands `/build`, `/abort`, `/factory-status`. Driven by what we learn in Phase 1 (e.g., what success-criteria patterns the triage agent actually produces, whether queued ideas tend to be coherent enough to build).

This phasing is also a hedge: if Phase 1 reveals that briefs don't yield buildable ideas at the rate we expect, we'd rather find out before sinking effort into the factory.

## Out of scope for v1

- Auto-PR creation.
- Deploy steps.
- Cross-idea synthesis ("idea A and idea B share a substrate").
- Web UI for browsing ideas — Telegram + git is enough.
- Multi-machine factory orchestration.
