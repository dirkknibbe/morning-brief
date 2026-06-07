# Morning-Brief — Phase 2 Factory Checkpoint

**Date:** 2026-06-03
**Status:** Factory BUILT + VALIDATED end-to-end. 3 LOW follow-up fixes coded + committed, blocked on Atlas reachability.

---

## TL;DR — where we are

The **code factory (Phase 2) is functionally complete and proven**:
- Dry-run #1: built `factory-smoke-adder` (3 machine criteria) into a private repo in **77s**, `terminator: done`, deliverable independently passed `bun test`.
- Dry-run #2: validated `/abort` (after the pgid fix) — `kill -- -<pgid>` killed the whole build group cleanly.

Three LOW follow-ups are coded, committed, and pushed but **not yet merged or live-validated** because Atlas started rejecting our IP mid-session.

## Shipped this arc (all merged to `main` + synced to `rehearsal`)

- **PR #5** — factory substrate: `src/criteria-classify.ts`, `src/factory-terminators.ts`, `src/factory-runs.ts`, `src/factory-guard.ts` (build-dir guard), `src/factory-lock.ts` (pgid), `scripts/init-db.ts` (`factory_runs`), `src/factory.ts` (CLI).
- **PR #6** — orchestration: `scripts/run-trigger.sh` (`SKIP_DEDUPE` + `MAX_BUDGET_USD`), `scripts/start-factory.sh` (perl-`setsid` detached launcher — macOS has no `setsid`), `triggers/factory.md` (build loop), `triggers/listener.md` (`/build` `/abort` `/factory-status`).
- **PR #7** — `/abort` pgid fix: `start-factory.sh` writes the group-leader pid (`$!`) to `/tmp/morning-brief-factory.pgid`; `factory.md` Step 0 reads it (the Bash tool runs each command in its own ephemeral pgroup, so `ps -o pgid= -p $$` was wrong). Validated live.

## IN FLIGHT — branch `claude/fix-factory-lows` (commit `c9788db`, pushed, NO PR yet)

Three LOW dry-run follow-ups, in `.claude/worktrees/phase-2-orch` (off `main`):
1. **rounds** — `run-finalize` now takes `--rounds`; `factory_runs.rounds` no longer stuck at 0 on first-pass-green. (`factory-runs.ts` `FinalizeFields.rounds?`, `factory.ts` run-finalize, `factory.md` terminate branches pass `--rounds $round`.)
2. **abort finalize** — new `factory run-abort --slug` (`abortOpenRun`) finalizes the open run as `terminator: aborted`; `listener.md` `/abort` now calls it.
3. **single log** — `start-factory.sh` logs to the per-day STEM log `logs/factory-<date>.log` (the per-slug log was always empty).

**Verified offline:** `bunx tsc --noEmit` clean; pure-logic + `run-trigger-env` + `start-factory` tests pass.
**NOT verified / NOT done:** live `factory-lock` smoke, `run-abort` live smoke, push-PR-merge, the throwaway dry-run.

## THE BLOCKER

Atlas rejects connections from the current IP:
```
MongoServerSelectionError: SSL ... tlsv1 alert internal error
"Please ensure that your Network Access List allows connections from your IP."
```
Current public IP: **`206.55.212.230`** — not in Atlas Network Access. (It worked earlier this session; the IP changed.) User is setting up **Atlas CLI + API keys** (option 3) to unblock and get programmatic control.

A MongoDB *data* MCP would NOT help — the block is at the TLS/connection layer (same IP, same rejection). Only the Atlas *control-plane* (UI / Atlas CLI / Admin API) can add the IP. Recommended long-term: allowlist `0.0.0.0/0` on this credential-protected staging cluster to stop the recurrence (it has bitten twice).

## NEXT SESSION — do this once Atlas is reachable

1. **Confirm Atlas up:** `cd /Users/dirkknibbe/morning-brief && bun run system-state status` (expect JSON, no SSL/auth error).
2. **Re-verify the fixes branch:** in `.claude/worktrees/phase-2-orch` (branch `claude/fix-factory-lows`): `bun test && bunx tsc --noEmit` — the `factory-lock` smoke should now pass. Then live-smoke `run-abort`:
   ```bash
   set -a; . ./.env; set +a
   mongosh "$MONGODB_URI" --quiet --eval "db.getSiblingDB('$MONGODB_DB').factory_runs.insertOne({idea_slug:'__abort_smoke__',started_at:new Date(),ended_at:null,terminator:null,rounds:0})"
   bun run factory run-abort --slug __abort_smoke__
   mongosh "$MONGODB_URI" --quiet --eval "const c=db.getSiblingDB('$MONGODB_DB').factory_runs; print(c.findOne({idea_slug:'__abort_smoke__'}).terminator); c.deleteMany({idea_slug:'__abort_smoke__'})"   # expect: aborted
   ```
3. **Push (done) → PR → merge:** `gh pr create --base main --head claude/fix-factory-lows ...`, merge, then `cd /Users/dirkknibbe/morning-brief && git merge origin/main` on `rehearsal` (clean fast-forward expected), push.
4. **Throwaway dry-run** (from `/Users/dirkknibbe/morning-brief`, on `rehearsal`): insert the throwaway idea (doc below), `rm -f /tmp/morning-brief-factory.pgid && bash scripts/start-factory.sh factory-smoke-adder`. Watch `logs/factory-$(date +%F).log` + `bun run factory lock-check`. Let it COMPLETE → confirm `factory_runs.rounds >= 1` (the fix) and `terminator: done`. Then teardown: `gh repo delete dirkknibbe/factory-smoke-adder --yes`, `rm -rf .claude/builds/factory-smoke-adder`, delete the idea + run docs.
5. **(Optional)** also abort a fresh build to confirm `/abort` now finalizes the run as `aborted`.

### Throwaway idea insert (mongosh)
```js
const c = db.getSiblingDB('<MONGODB_DB>').ideas;
c.deleteOne({ slug: 'factory-smoke-adder' });
c.insertOne({ slug:'factory-smoke-adder', content_hash:'factory-smoke-adder-v3', title:'Factory smoke test: adder module', raw_text:'Throwaway to validate the factory loop.', sources:[{brief:'manual',section:'factory-smoke'}], signal_strength:2, status:'queued', kind:'simple', parents:null, synthesis_thesis:null, synthesis_depth:NumberInt(0), prior_art:null, scores:{novelty:1,fit:1,buildable:5,scope:5}, success_criteria:['src/add.ts exports a function add(a, b) that returns a + b','src/add.ts is under 20 lines','README.md exists and contains the word add'], rejection_reason:null, learnings:[], attempts:NumberInt(0), theme_hints:[], created_at:new Date(), updated_at:new Date() });
```

## Setup notes
- Main worktree `/Users/dirkknibbe/morning-brief` is on `rehearsal` (where the loop + listener run). Fix work in `.claude/worktrees/phase-2-orch` on `claude/fix-factory-lows`.
- Bun, not pnpm. `bunx tsc --noEmit` is the type-check ground truth. Tests: `bun test`.
- Never `cat .env`. `MONGODB_DB=morning-brief-staging`. Commits have NO Co-Authored-By trailer.
- `gh repo delete` needs the `delete_repo` scope (worked earlier this session).
- VFS `gotchas.md` has: the recurrence-vs-synthesis finding, the extract empty-title bug, launchd template drift, the factory dry-run findings (abort fixed, the 3 lows), and the Atlas IP recurrence.

## After the 3 lows land
Factory is fully done. The next real milestone is the **first real build**: `/build uipe-as-skill-with-named-v0-harness-adapters` — it finishes "done-partial" with the screencast criterion on the human handoff checklist.

## Reference
- Spec: `docs/superpowers/specs/2026-05-31-factory-loop-design.md`
- Plans: `docs/superpowers/plans/2026-05-31-factory-substrate.md`, `…-factory-orchestration.md`
- Prior handoff: `docs/superpowers/handoffs/2026-05-17-checkpoint.md`
