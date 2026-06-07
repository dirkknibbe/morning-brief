/**
 * factory.ts — CLI surface for triggers/factory.md (Plan 2). One subcommand
 * per argv[2]. Compute-only subcommands (classify, cap-check, stuck-check)
 * need no DB; lock/run subcommands open a MongoClient.
 *
 * Subcommands:
 *   classify     --json '<criteria string array>'        -> Classification[]
 *   cap-check    --round N --elapsed-ms M                 -> "capped" | "ok"
 *   stuck-check  --failing-json '[...]' --hypotheses-json '[...]'  -> "stuck" | "ok"
 *   lock-acquire --slug S --ttl-ms M --pid P --pgid G     -> LockResult
 *   lock-release --slug S
 *   lock-check                                            -> LockState | "null"
 *   run-create   --slug S --build-dir D --branch B --classification-json '[...]' -> runId
 *   run-append   --id ID --n N --failing F --hypothesis H --excerpt E
 *   run-finalize --id ID --terminator T [--branch B --repo-url U --cost-usd C --tokens K --duration-s D --rounds N]
 *   run-abort    --slug S                                (finalize the open run as aborted)
 */
import { MongoClient } from "mongodb";
import { classifyAll } from "./criteria-classify";
import { isCapped, decideStuck } from "./factory-terminators";
import { embed } from "./embeddings";
import { acquireLock, releaseLock, checkLock } from "./factory-lock";
import {
  buildRunDoc,
  buildRoundEntry,
  createRun,
  appendRound,
  finalizeRun,
  abortOpenRun,
  type Terminator,
} from "./factory-runs";

function parseFlagArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    out[key.slice(2)] = argv[i + 1] ?? "";
  }
  return out;
}

async function main() {
  const sub = process.argv[2];
  const args = parseFlagArgs(process.argv.slice(3));

  // ---- compute-only subcommands (no DB) ----
  if (sub === "classify") {
    const criteria: string[] = JSON.parse(args["json"] ?? "[]");
    console.log(JSON.stringify(classifyAll(criteria)));
    return;
  }
  if (sub === "cap-check") {
    const capped = isCapped(Number(args["round"]), Number(args["elapsed-ms"]));
    console.log(capped ? "capped" : "ok");
    return;
  }
  if (sub === "stuck-check") {
    const failing: number[] = JSON.parse(args["failing-json"] ?? "[]");
    const hyps: string[] = JSON.parse(args["hypotheses-json"] ?? "[]");
    const vecs = await Promise.all(hyps.map((h) => embed(h)));
    console.log(decideStuck(failing, vecs) ? "stuck" : "ok");
    return;
  }

  // ---- DB subcommands ----
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("factory: MONGODB_URI is not set");
    process.exit(1);
  }
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB);

    switch (sub) {
      case "lock-acquire": {
        const res = await acquireLock(
          db,
          args["slug"],
          Number(args["ttl-ms"]),
          Number(args["pid"]),
          Number(args["pgid"]),
        );
        console.log(JSON.stringify(res));
        break;
      }
      case "lock-release":
        await releaseLock(db, args["slug"]);
        console.log("released");
        break;
      case "lock-check": {
        const state = await checkLock(db);
        console.log(state ? JSON.stringify(state) : "null");
        break;
      }
      case "run-create": {
        const doc = buildRunDoc({
          idea_slug: args["slug"],
          build_dir: args["build-dir"],
          branch: args["branch"],
          criteria_classification: JSON.parse(args["classification-json"] ?? "[]"),
        });
        console.log(await createRun(db, doc));
        break;
      }
      case "run-append":
        await appendRound(
          db,
          args["id"],
          buildRoundEntry(Number(args["n"]), Number(args["failing"]), args["hypothesis"], args["excerpt"] ?? ""),
        );
        console.log("appended");
        break;
      case "run-finalize": {
        const fields: any = {
          terminator: args["terminator"] as Terminator,
          ended_at: new Date(),
          repo_url: args["repo-url"] ?? null,
          cost_usd: args["cost-usd"] ? Number(args["cost-usd"]) : null,
          tokens: args["tokens"] ? Number(args["tokens"]) : null,
          duration_s: args["duration-s"] ? Number(args["duration-s"]) : null,
        };
        if (args["branch"]) fields.branch = args["branch"];
        if (args["rounds"]) fields.rounds = Number(args["rounds"]);
        await finalizeRun(db, args["id"], fields);
        console.log("finalized");
        break;
      }
      case "run-abort":
        await abortOpenRun(db, args["slug"]);
        console.log("aborted-run");
        break;
      default:
        console.error(`factory: unknown subcommand "${sub}"`);
        process.exit(2);
    }
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
