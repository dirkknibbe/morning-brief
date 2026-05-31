# Factory Loop (Phase 2) — Design

**Date:** 2026-05-31
**Status:** Approved design, ready for implementation plan
**Supersedes:** the `### 5. Factory` section of `docs/superpowers/specs/2026-05-11-ideas-pipeline-and-code-factory-design.md`, which was written before any real triage data existed.

---

## Why this revises the 2026-05-11 spec

The original spec deferred factory mechanics until we could observe "what success-criteria patterns the triage agent actually produces." We now have that data. The first real `queued` idea (`uipe-as-skill-with-named-v0-harness-adapters`, scored 17/20) produced these seven success criteria:

| # | Criterion | Verifiable how? |
|---|-----------|-----------------|
| 1 | SKILL.md < 300 lines, defines `scene(target)` and `diff(before, after)` | scriptable (file + lint check) |
| 2 | `perception.py` exposes `scene(url\|tab_id) -> SceneGraph` and `diff(...) -> DiffReport`, callable from Python | scriptable (import + signature) |
| 3 | Skill loads via the Skill tool in Claude Code (matches Anthropic manifest schema) | external integration (needs the harness) |
| 4 | `scene()` returns same node identity for a moved element across DOM-rerender reruns | **executable test** |
| 5 | AgentHandover adapter stub: 30-line Python file consuming `scene()` output | scriptable (artifact + shape) |
| 6 | ClankerView adapter stub: 30-line snippet consuming `diff()` output | scriptable (artifact + shape) |
| 7 | Two screencasts saved under `demo/` before W26 Demo Day | **human action — not automatable** |

**The finding:** only ~1 of 7 is a true executable test; ~4 are scriptable artifact/shape assertions; 1 needs an external harness; 1 is a human action. The original spec's core loop ("run all success-criteria tests → pass/fail") and its scope-break rule ("a human action → reclassify the whole idea `needs_human`") would have **aborted this build on criterion #7** despite 6/7 being machine-checkable. That is the central thing the real data changed, and it drives this design.

(See also `vfs.persistent/gotchas.md`: triage is fed by synthesis, not recurrence — the queued idea is a `kind: synthesis` with `signal_strength: 2`.)

---

## Decisions (locked during brainstorming 2026-05-31)

1. **Verifiability — classify + partial-done.** The factory classifies each criterion as `test`, `scriptable`, or `human_or_external`, builds and verifies every machine-checkable one, and emits the human/external ones as a handoff checklist. "Done" = all machine criteria green + checklist delivered. Human/external criteria are **never** a scope-break.
2. **Build target — a separate private repo per build**, scaffolded from `dirkknibbe/project-template`, cloned into `.claude/builds/<slug>/`. The interactive `/install-github-app` step is skipped (the autonomous run can't perform it and the user opted out). Built ideas are independent products, not morning-brief code.
3. **Autonomy + caps.** `/build` runs the loop unattended, bounded by a wall-clock cap (30 min), a round cap (20), and stuck-detection, plus the shipped deny-list. `/abort` stops it anytime.
4. **Execution — `setsid nohup`, not tmux.** A detached process group, killed by stored `pgid`. Monitoring is via Telegram heartbeats + `/factory-status` + the log file. (tmux's only advantage — interactive attach — is unnecessary here, and avoids a dependency the user is wary of.)
5. **Budget — flat $20 ceiling as a backstop**, with actual cost/tokens/rounds/duration recorded in `factory_runs` every build. The time/round/stuck caps are the real terminators. A budget estimator is a data-driven fast-follow, not v1.

---

## Architecture

```
Telegram /build <slug>
  → triggers/listener.md  (pre-checks: lock free, idea queued, factory_enabled)
    → scripts/start-factory.sh <slug>
      → setsid nohup env IDEA_SLUG=<slug> ./scripts/run-trigger.sh triggers/factory.md
         (detached process group; pgid+pid recorded in factory_lock)
        → triggers/factory.md  (the build loop)
           ├─ src/factory-lock.ts        acquire / release / TTL-takeover
           ├─ src/criteria-classify.ts   classify each success criterion
           ├─ src/factory-runs.ts        create run, append rounds, finalize
           ├─ src/factory-guard.ts       assert cwd == .claude/builds/<slug>
           └─ gh + project-template      scaffold private repo, push branch
```

The factory runs **locally** — it needs the machine's `gh` auth, `bun`, `.env`, and filesystem. A cloud `RemoteTrigger` agent cannot touch local git/gh, so cloud execution is out.

---

## Build flow (`triggers/factory.md`)

**Setup:**
1. `bun run system-state check factory` — if frozen or `factory_enabled=false`, exit without side effects.
2. `acquireLock(slug, ttlMs)` — one build at a time. If held by a fresh lock, exit (the listener also pre-checks, but this is the authoritative gate). The lock doc records `idea_slug`, `started_at`, `pid`, `pgid`, `ttl_ms`.
3. Load the idea by slug; assert `status === "queued"`. Read `success_criteria`, `synthesis_thesis`, `parents`, and the source brief(s)/dossier(s) referenced in `sources`.
4. Transition `queued → building` (audited via the existing `setStatus` path).
5. **Classify each criterion** via `classifyCriterion(text)` → `{ kind: "test" | "scriptable" | "human_or_external", rationale }`. The pure classifier provides a deterministic first pass; the trigger's LLM may upgrade/downgrade a classification but must record the final decision. Persist the full classification array on the `factory_runs` doc.
6. Scaffold the build target:
   ```
   gh repo create dirkknibbe/<slug> --private --template dirkknibbe/project-template \
     --clone .claude/builds/<slug>
   cd .claude/builds/<slug>
   ```
   `assertInBuildDir(slug, repoRoot, cwd)` (the repurposed factory-guard) confirms cwd before any write.
7. Invoke `superpowers:writing-plans` against the **machine-verifiable** criteria only (`test` + `scriptable`). Commit the plan into the new repo as `docs/plans/<date>-<slug>.md`.
8. Establish the project's test command (e.g. `pytest` for Python, `bun test` for TS) and a `scriptable`-assertion runner (a small shell/script that checks file existence, line counts, exported symbols, manifest schema, etc.).
9. Enter the iteration loop.

**Iteration loop** (each iteration = one round; append a `rounds_log` entry every round):
1. Run the machine-verifiable suite (`test` tests + `scriptable` assertions).
2. **All machine criteria pass → DONE-PARTIAL:**
   - Push the repo (default branch).
   - Send Telegram: repo URL + the **human/external handoff checklist** (every `human_or_external` criterion, verbatim).
   - `releaseLock`, transition idea `building → built`.
   - Finalize `factory_runs` with `terminator: "done"`, `repo_url`, `human_handoff[]`, `cost_usd`, `tokens`, `rounds`, `duration_s`.
3. **Some fail — check terminators in order:**
   - **Caps:** if `round > 20` OR wall-clock `> 30 min` → finalize `terminator: "capped"`; write `learnings.md`, push branch `<slug>-capped`, Telegram `capped after N rounds`; idea `building → parked`.
   - **Stuck:** 5 consecutive rounds where `failing_test_count` did not decrease AND the round's `hypothesis_text` is cosine > 0.9 to a prior round's → finalize `terminator: "stuck"`; write `learnings.md`, push branch `<slug>-stuck`, Telegram `stuck after N rounds`; idea `building → parked`, `signal_strength − 1`.
   - **Scope-break:** if a **machine** criterion turns out to require a paid API / external infra / human action to even *implement* → finalize `terminator: "scope-break"`; record the blocker; idea `building → needs_human`; no branch push. (A `human_or_external` criterion is NOT a scope-break — it was already routed to the handoff checklist.)
   - **Otherwise:** generate a hypothesis for the smallest-failure-delta criterion → implement TDD (write/extend the failing test first if missing, then make it pass) → `git commit -m "round N: <hypothesis>"` → Telegram heartbeat `round N — X/Y machine criteria passing — <hypothesis>` → loop.

---

## Components

| File | New/Modify | Responsibility |
|------|-----------|----------------|
| `triggers/factory.md` | new | The build-loop prompt: setup → classify → scaffold → plan → iterate. No frontmatter (matches existing trigger style). |
| `scripts/start-factory.sh` | new | Launch the build as a detached process group (`setsid nohup`), capture `pid`+`pgid`, hand them to the lock. Refuse if `.env`/`gh`/`bun` missing. |
| `src/criteria-classify.ts` | new | Pure `classifyCriterion(text): { kind, rationale }` + `classifyAll(criteria)`. Keyword/heuristic based. Unit-tested. |
| `src/factory-runs.ts` | new | `createRun`, `appendRound`, `finalizeRun` against the `factory_runs` collection. |
| `src/factory-guard.ts` | modify | Add `expectedBuildDir(slug, repoRoot)` = `<repoRoot>/.claude/builds/<slug>` and `assertInBuildDir(...)`; keep the worktree functions for backward-compat but the factory uses the build-dir variant. |
| `src/factory-lock.ts` | modify | Persist `pgid` alongside `pid` so `/abort` can kill the whole process group. |
| `triggers/listener.md` | modify | Add `/build`, `/abort`, `/factory-status` (see below). |
| `scripts/init-db.ts` | modify | Create the `factory_runs` collection + indexes (`idea_slug`, `started_at`). No `ideas` schema change — the status machine already supports `building → built\|parked\|needs_human`. |

---

## Data model

### `factory_lock` (existing collection, one extra field)

```ts
{ _id: "singleton", idea_slug: string, started_at: Date, ttl_ms: number,
  pid: number, pgid: number }
```

### `factory_runs` (new collection)

```ts
{
  _id: ObjectId,
  idea_slug: string,
  started_at: Date,
  ended_at: Date | null,
  terminator: "done" | "stuck" | "scope-break" | "capped" | "aborted" | null,
  rounds: number,
  branch: string,
  repo_url: string | null,
  build_dir: string,                     // .claude/builds/<slug>
  criteria_classification: [{ text: string, kind: "test" | "scriptable" | "human_or_external", rationale: string }],
  human_handoff: string[],               // the human_or_external criteria, verbatim
  rounds_log: [{ n: number, failing_test_count: number, hypothesis: string, test_output_excerpt: string }],
  cost_usd: number | null,
  tokens: number | null,
  duration_s: number | null,
}
```

Indexes: `{ idea_slug: 1 }`, `{ started_at: -1 }`.

### `ideas` status transitions used (no schema change)

`queued → building` (build starts) → one of `built` (done-partial), `parked` (stuck/capped), `needs_human` (scope-break), or back to `queued` (aborted). All already permitted by `ALLOWED_TRANSITIONS` in `src/status.ts`.

---

## Listener commands (`triggers/listener.md`)

| Command | Action |
|---------|--------|
| `/build <slug>` | Pre-check: `checkLock()` is null, idea exists with `status === "queued"`, `factory_enabled`. If OK → `scripts/start-factory.sh <slug>` and reply `🏭 building <slug> — heartbeats incoming`. Else reply why it was refused (lock held by `<other-slug>`, idea not queued, or factory disabled). |
| `/abort [<slug>]` | Read `factory_lock`; if held (optionally matching `<slug>`), `kill -- -<pgid>` (whole group), `releaseLock`, transition idea `building → queued`, finalize the open `factory_runs` with `terminator: "aborted"`. Leave `.claude/builds/<slug>` intact. Reply `🛑 aborted <slug>`. |
| `/factory-status` | `checkLock()`; if held, read the open `factory_runs` doc for that slug and reply: idea, current round, X/Y machine criteria passing, last hypothesis, elapsed time. If no lock, reply `no build running`. |

Existing `/ideas`, `/idea`, `/reject`, `/freeze`, `/unfreeze`, `/system-status` are unchanged.

---

## Safety

- **Deny-list** (shipped 1.5b): blocks `*publish`, `vercel*`, `gh release *`, `git push --force/-f/--no-verify`. The factory inherits it.
- **Private repo:** every scaffolded repo is `--private`.
- **One build at a time:** `factory_lock` with TTL-takeover prevents a crashed build from blocking forever, and prevents concurrent builds clobbering each other.
- **Clean kill:** `setsid` process group + stored `pgid` → `/abort` reliably kills `claude` + `bun` children.
- **Budget backstop:** `run-trigger.sh` invokes `claude --max-budget-usd 20` for the factory trigger. The 30-min / 20-round / stuck caps are the primary terminators.
- **System gate:** `system-state check factory` honors global `frozen` and per-stage `factory_enabled`, so `/freeze` halts builds too.

---

## Testing

- **Pure logic — TDD unit tests:** `criteria-classify.ts` (each `kind` + ambiguous cases), the cap detector, the stuck detector (5-round + cosine logic), and the `factory_runs` doc builders.
- **I/O — staging smoke:** `factory_runs` CRUD against `morning-brief-staging`; `factory_lock` pgid field (extends the existing lock smoke).
- **End-to-end — one real dry-run build:** run the factory against the queued `uipe-as-skill-...` idea (or a deliberately tiny throwaway idea) and confirm: repo scaffolds, plan commits, machine criteria drive rounds, done-partial fires with the screencast criterion (#7) on the handoff checklist (not a scope-break), `factory_runs` records actuals.

---

## Open behaviors we'll learn from real runs

- Whether the heuristic classifier needs an LLM upgrade (how often it mis-buckets a criterion).
- Real cost/round distributions → whether a budget estimator earns its keep, and whether 30 min / 20 rounds are the right caps.
- Whether `project-template` is the right scaffold for the variety of builds (skills vs MCP servers vs CLIs), or whether the factory needs to pick a template per idea kind.
- Whether stuck-detection (cosine > 0.9, 5 rounds) fires too early or too late.

---

## Out of scope for v1

- Builds that need a paid API / external infra / human action to *implement* (→ `needs_human`).
- Concurrent builds (lock = 1).
- Auto-graduation / auto-merge of built repos (you inspect and adopt winners manually).
- Multi-repo or monorepo builds.
- The budget-estimator agent (data-driven fast-follow).
- Per-idea-kind template selection.
