/**
 * system-state.ts — system-wide kill switch and per-stage enable flags.
 *
 * Mongo I/O + CLI. Pure `canRun` exported for testing the gating decision.
 *
 * Library API (used by extract-ideas.ts and other triggers):
 *   isFrozen(db) → boolean
 *   isEnabled(db, stage) → boolean
 *   canRun(state, stage) → boolean   (pure)
 *   setFrozen(db, frozen, reason, actor)
 *   setEnabled(db, stage, enabled, actor)
 *   getState(db) → SystemState
 *
 * CLI:
 *   status                        — print current state as JSON
 *   check <stage>                 — exit 0 if stage may run, 1 otherwise (for shell gates)
 *   not-frozen                    — exit 0 if system is not frozen, 1 otherwise (for shell gates)
 *   freeze [reason]               — set frozen=true
 *   unfreeze                      — set frozen=false
 *   enable  <stage>               — set <stage>_enabled=true
 *   disable <stage>               — set <stage>_enabled=false
 */

import { MongoClient, type Db } from "mongodb";

export type Stage = "extract" | "synthesize" | "triage" | "factory";

const STAGES: readonly Stage[] = ["extract", "synthesize", "triage", "factory"];

function isStage(s: string): s is Stage {
  return (STAGES as readonly string[]).includes(s);
}

export interface SystemState {
  frozen: boolean;
  extract_enabled: boolean;
  synthesize_enabled: boolean;
  triage_enabled: boolean;
  factory_enabled: boolean;
  freeze_reason: string | null;
  updated_at: Date;
  updated_by: string;
}

const SINGLETON_ID = "singleton";

export function canRun(state: SystemState, stage: Stage): boolean {
  if (state.frozen) return false;
  switch (stage) {
    case "extract":    return state.extract_enabled;
    case "synthesize": return state.synthesize_enabled;
    case "triage":     return state.triage_enabled;
    case "factory":    return state.factory_enabled;
  }
}

export async function getState(db: Db): Promise<SystemState> {
  const doc = await db.collection("system_state").findOne({ _id: SINGLETON_ID as any });
  if (!doc) {
    throw new Error("system_state singleton missing — run `bun run init-db`");
  }
  return {
    frozen: doc.frozen,
    extract_enabled: doc.extract_enabled,
    synthesize_enabled: doc.synthesize_enabled,
    triage_enabled: doc.triage_enabled,
    factory_enabled: doc.factory_enabled,
    freeze_reason: doc.freeze_reason ?? null,
    updated_at: doc.updated_at,
    updated_by: doc.updated_by,
  };
}

export async function isFrozen(db: Db): Promise<boolean> {
  return (await getState(db)).frozen;
}

/**
 * isEnabled checks ONLY the per-stage `<stage>_enabled` flag — it does NOT
 * consult the master `frozen` flag. Callers that need "may this stage run
 * right now" should check `isFrozen` AND `isEnabled` separately, OR call
 * `canRun(getState(db), stage)` for the combined check.
 */
export async function isEnabled(db: Db, stage: Stage): Promise<boolean> {
  const state = await getState(db);
  switch (stage) {
    case "extract":    return state.extract_enabled;
    case "synthesize": return state.synthesize_enabled;
    case "triage":     return state.triage_enabled;
    case "factory":    return state.factory_enabled;
  }
}

export async function setFrozen(
  db: Db,
  frozen: boolean,
  reason: string | null,
  actor: string,
): Promise<void> {
  await db.collection("system_state").updateOne(
    { _id: SINGLETON_ID as any },
    {
      $set: {
        frozen,
        freeze_reason: frozen ? reason : null,
        updated_at: new Date(),
        updated_by: actor,
      },
    },
  );
}

export async function setEnabled(
  db: Db,
  stage: Stage,
  enabled: boolean,
  actor: string,
): Promise<void> {
  const field = `${stage}_enabled`;
  await db.collection("system_state").updateOne(
    { _id: SINGLETON_ID as any },
    {
      $set: {
        [field]: enabled,
        updated_at: new Date(),
        updated_by: actor,
      },
    },
  );
}

// CLI
if (import.meta.main) {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("system-state: MONGODB_URI is not set");
    process.exit(1);
  } else {
    await (async () => {
      const dbName = process.env.MONGODB_DB ?? "morning-brief";
      const mode = process.argv[2];
      const client = new MongoClient(uri);
      const exitClean = async (code: number) => {
        await client.close();
        process.exit(code);
      };

      try {
        await client.connect();
        const db = client.db(dbName);

        if (mode === "status") {
          const state = await getState(db);
          console.log(JSON.stringify(state, null, 2));
        } else if (mode === "check") {
          const stage = process.argv[3];
          if (!stage || !isStage(stage)) {
            console.error(`usage: system-state check <stage>  (one of: ${STAGES.join(", ")})`);
            await exitClean(1);
            return;
          }
          const state = await getState(db);
          await exitClean(canRun(state, stage) ? 0 : 1);
          return;
        } else if (mode === "not-frozen") {
          const state = await getState(db);
          const ok = !state.frozen;
          await exitClean(ok ? 0 : 1);
        } else if (mode === "freeze") {
          const reason = process.argv[3] ?? null;
          await setFrozen(db, true, reason, "user-cli");
          console.log(`🚨 system frozen${reason ? ` (${reason})` : ""}`);
        } else if (mode === "unfreeze") {
          await setFrozen(db, false, null, "user-cli");
          console.log("✓ system unfrozen");
        } else if (mode === "enable" || mode === "disable") {
          const stage = process.argv[3];
          if (!stage || !isStage(stage)) {
            console.error(`usage: system-state ${mode} <stage>  (one of: ${STAGES.join(", ")})`);
            await exitClean(1);
            return;
          }
          await setEnabled(db, stage, mode === "enable", "user-cli");
          console.log(`✓ ${stage} ${mode === "enable" ? "enabled" : "disabled"}`);
        } else {
          console.error("usage: system-state <status|check|not-frozen|freeze|unfreeze|enable|disable> [args]");
          await exitClean(1);
          return;
        }
      } catch (e) {
        console.error("system-state failed:", (e as Error).message);
        await exitClean(1);
        return;
      } finally {
        await client.close();
      }
    })();
  }
}
