/**
 * init-db.ts — one-shot MongoDB setup for morning-brief.
 *
 * Creates the three collections and their indexes. Idempotent — safe to
 * re-run; existing collections and indexes are left alone.
 *
 * Usage:
 *   MONGODB_URI=... MONGODB_DB=morning-brief bun run scripts/init-db.ts
 */

import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB ?? "morning-brief";

if (!uri) {
  console.error("Missing MONGODB_URI");
  process.exit(1);
}

const client = new MongoClient(uri);

try {
  await client.connect();
  const db = client.db(dbName);

  // Ensure collections exist (createCollection is idempotent if we catch
  // the "already exists" error).
  const collections = ["seen_items", "signals", "preferences", "ideas", "audit_log", "system_state"];
  const existing = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map(
      (c) => c.name
    )
  );
  for (const name of collections) {
    if (!existing.has(name)) {
      await db.createCollection(name);
      console.log(`✓ created collection: ${name}`);
    } else {
      console.log(`· collection already exists: ${name}`);
    }
  }

  // Indexes — createIndex is idempotent by name.
  await db.collection("seen_items").createIndex({ last_seen: -1 });
  await db.collection("seen_items").createIndex({ times_seen: -1 });
  console.log("✓ seen_items indexes");

  await db.collection("signals").createIndex({ date: -1, theme: 1 });
  console.log("✓ signals index");

  await db
    .collection("preferences")
    .createIndex({ theme: 1 }, { unique: true });
  console.log("✓ preferences index");

  await db.collection("ideas").createIndex({ slug: 1 }, { unique: true });
  try { await db.collection("ideas").dropIndex("content_hash_1"); } catch {}
  await db.collection("ideas").createIndex({ content_hash: 1 }, { unique: true });
  await db.collection("ideas").createIndex({ status: 1 });
  await db.collection("ideas").createIndex({ signal_strength: -1 });
  await db.collection("ideas").createIndex({ created_at: -1 });
  console.log("✓ ideas indexes");

  await db.collection("audit_log").createIndex({ slug: 1, ts: -1 });
  await db.collection("audit_log").createIndex({ ts: -1 });
  console.log("✓ audit_log indexes");

  const stateExisting = await db.collection("system_state").findOne({ _id: "singleton" as any });
  if (!stateExisting) {
    await db.collection("system_state").insertOne({
      _id: "singleton" as any,
      frozen: false,
      extract_enabled: true,
      synthesize_enabled: true,
      triage_enabled: true,
      factory_enabled: true,
      freeze_reason: null,
      updated_at: new Date(),
      updated_by: "init-db",
    });
    console.log("✓ system_state singleton seeded");
  } else {
    console.log("· system_state singleton already exists");
  }

  console.log(`\nDone. Database: ${dbName}`);
} catch (err) {
  console.error("init-db failed:", (err as Error).message);
  process.exitCode = 1;
} finally {
  await client.close();
}
