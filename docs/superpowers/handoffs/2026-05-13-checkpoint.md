# Morning-Brief — Session Handoff Checkpoint
**Date:** 2026-05-13
**Branch:** `claude/busy-chandrasekhar-b7e90a` → PR [#1](https://github.com/dirkknibbe/morning-brief/pull/1)
**Worktree:** `/Users/dirkknibbe/morning-brief/.claude/worktrees/busy-chandrasekhar-b7e90a`
**Last commit:** `c5a6504` (Phase 1.5b deny list)
**Status:** 54/54 tests, `bunx tsc --noEmit` clean

---

## What's shipped on this branch

Three phases of an ideas-pipeline-and-code-factory project (spec at `docs/superpowers/specs/2026-05-11-ideas-pipeline-and-code-factory-design.md`).

### Phase 1a — "Ideas surface themselves" (commits up to `7f0a043`)
- `src/content-hash.ts`, `src/parse-ideas.ts`, `src/dedupe-ideas.ts`, `src/ideas-state.ts`, `src/extract-ideas.ts`
- `briefs/*.md` and `actions/*.md` parsed nightly into Mongo `ideas` collection (idempotent via `content_hash`).
- Telegram listener: `/ideas`, `/idea <slug>`, `/reject <slug>`.
- Daily loop runs `bun run extract-ideas` after `action-research`.
- 18 ideas currently in the `ideas` collection (against `morning-brief-staging` DB).

### Phase 1.5a — Guardrails Tier 1 (commits `535fe35..682b73b`)
- `src/status.ts` — state machine with `ALLOWED_TRANSITIONS` and `IllegalTransitionError`.
- `src/audit.ts` — best-effort `recordTransition` writes to `audit_log` on every status change and every successful insert.
- `src/system-state.ts` — kill switch CLI: `status`, `check <stage>`, `not-frozen`, `freeze [reason]`, `unfreeze`, `enable <stage>`, `disable <stage>`. Stage enum: `extract|synthesize|triage|factory`.
- Telegram listener: `/freeze`, `/unfreeze`, `/system-status`.
- `loop-triggers.sh` gates every step. Brief and action-research only check `not-frozen` (they predate the Stage enum); extract-ideas checks `check extract`.
- `init-db` applies `$jsonSchema` validator on `ideas` in **warn mode** (logs but doesn't reject).

### Phase 1.5b — Guardrails Tier 2 / factory prerequisites (commits `5967f62..c5a6504`)
- `src/factory-lock.ts` — atomic two-phase Mongo mutex with TTL takeover. Single-doc `factory_lock` collection. `releaseLock` is ownership-gated.
- `src/factory-guard.ts` — pure `assertInFactoryWorktree(slug, repoRoot, cwd?)` throws `WrongWorktreeError`.
- `scripts/hooks/pre-push` — rejects pushes to `main`, all tag pushes, force-pushes.
- `scripts/install-hooks.sh` — idempotent symlink installer using `git rev-parse --git-common-dir` (works in main + all worktrees).
- `.claude/settings.json` — 13-entry `permissions.deny` list blocking `npm/yarn/pnpm/bun publish*`, `vercel*`, `gh release create/delete/upload*`, `git push --force/-f/--no-verify*`.

---

## What's pending (in priority order)

1. **Phase 1b — synthesize + triage + factory** (the actual code-factory). Spec already written in `docs/superpowers/specs/2026-05-11-ideas-pipeline-and-code-factory-design.md`. Will need its own plan via `superpowers:writing-plans`. Three substantial pieces:
   - `triggers/synthesize.md` + `src/cluster-ideas.ts` (embeddings + mid-band clustering for cross-idea synthesis).
   - `triggers/triage.md` (LLM scores survivors with prior-art web scan, writes success_criteria).
   - `triggers/factory.md` + factory loop with backstops (token / turn / wall-clock ceilings — primitives ready in 1.5b, loop wraps them).

2. **`promote-validators.sh` one-shot** — flip the `ideas` `$jsonSchema` validator from `warn` → `error` after one daily cycle confirms zero violations on real data. Final 1.5a review also recommended converting the schema's `oneOf`-negation to JSON Schema draft-7 `if/then` form (MongoDB 5.0+ supports it) at the same time — closes a vacuous-pass edge case that warn mode currently masks.

3. **Compound `{status: 1, signal_strength: -1}` index on `ideas`** — flagged in Phase 1a's review as a forward-looking optimization for triage queries. Add when collection grows past hundreds of ideas.

---

## Setup notes for a fresh session

The worktree at `.claude/worktrees/busy-chandrasekhar-b7e90a` is harness-managed. From inside it:

- `MONGODB_URI` lives in the main repo's `.env` (not the worktree's). Symlink for live commands: `ln -s /Users/dirkknibbe/morning-brief/.env .env` then `rm .env` after. **Never `cat` the .env file** — secrets policy from `~/.claude/CLAUDE.md`.
- The pre-push hook is installed in `.git/hooks/pre-push` (shared via `--git-common-dir`) — already active. If a new clone, run `bash scripts/install-hooks.sh`.
- `MONGODB_DB=morning-brief-staging` is the active DB — separate from the `morning-brief` prod DB.
- The PR review GitHub workflow runs but doesn't post comments (default permissions too restrictive — `pull-requests: read` instead of `write`). Either fix the workflow YAML or rely on local reviews.

## Useful one-liners

```bash
# Check pipeline state
bun run system-state status        # frozen flag + per-stage enables
bun run ideas list                 # top 50 ideas sorted by signal_strength

# Kill switch
bun run system-state freeze "reason"      # pause everything
bun run system-state unfreeze
bun run system-state disable extract      # pause one stage only

# Re-extract from briefs/actions (idempotent)
bun run extract-ideas

# Tests + types
bun test && bunx tsc --noEmit
```

## Reference files

- **Specs** (the source of truth):
  - `docs/superpowers/specs/2026-05-11-ideas-pipeline-and-code-factory-design.md` — the whole pipeline + factory.
  - `docs/superpowers/specs/2026-05-12-phase-1.5-guardrails-design.md` — Tier 1 + Tier 2 guardrails.
- **Plans** (what we executed):
  - `docs/superpowers/plans/2026-05-11-ideas-pipeline-phase-1a.md`
  - `docs/superpowers/plans/2026-05-12-phase-1.5a-guardrails.md`
  - `docs/superpowers/plans/2026-05-13-phase-1.5b-factory-prereqs.md`
- **Brief format** (parser input): `briefs/2026-04-08.md`, `briefs/2026-04-09.md`.
- **Action dossier format** (parser input): `actions/2026-04-09-silent-degradation-canary.md`.

## Project conventions you'd otherwise rediscover

- Bun + TypeScript. `bunx tsc --noEmit` is the type-check ground truth (not `pnpm exec tsc`). Tests via `bun test`.
- Tests live in `src/__tests__/`. Live-Mongo tests use `test.skipIf(!process.env.MONGODB_URI)` and clean up after themselves with `afterEach`.
- Pure I/O modules don't have unit tests — covered by integration smoke. Pure logic modules always have unit tests.
- Mongo singleton-doc pattern: `_id: "singleton" as any` (string `_id` requires the cast).
- Audit writes are wrapped in their own try/catch with `console.error` — best-effort, never propagate to caller after the primary write committed.
- Status transitions are append-only in `audit_log` (no deletes).
- Worktrees live under `.claude/worktrees/`. Harness manages cleanup — don't `git worktree remove` from this session.
