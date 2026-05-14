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

const IDEAS_VALIDATOR = {
  $jsonSchema: {
    bsonType: "object",
    required: [
      "slug",
      "content_hash",
      "title",
      "raw_text",
      "sources",
      "signal_strength",
      "status",
      "kind",
      "synthesis_depth",
      "created_at",
      "updated_at",
    ],
    properties: {
      slug: { bsonType: "string", minLength: 1 },
      content_hash: { bsonType: "string", minLength: 1 },
      title: { bsonType: "string" },
      raw_text: { bsonType: "string" },
      sources: { bsonType: "array" },
      signal_strength: { bsonType: ["int", "long", "double"], minimum: 1 },
      status: {
        enum: [
          "extracted",
          "queued",
          "building",
          "built",
          "parked",
          "rejected",
          "needs_human",
        ],
      },
      kind: { enum: ["simple", "synthesis"] },
      synthesis_depth: { bsonType: ["int", "long"], minimum: 0, maximum: 2 },
      parents: { bsonType: ["array", "null"] },
      synthesis_thesis: { bsonType: ["string", "null"] },
      success_criteria: { bsonType: ["array", "null"] },
      prior_art: { bsonType: ["object", "null"] },
      scores: { bsonType: ["object", "null"] },
      rejection_reason: { bsonType: ["string", "null"] },
      learnings: { bsonType: "array" },
      attempts: { bsonType: ["int", "long"], minimum: 0 },
      theme_hints: { bsonType: "array" },
      created_at: { bsonType: "date" },
      updated_at: { bsonType: "date" },
    },
    allOf: [
      // If status is "building", success_criteria must be a non-empty array.
      {
        oneOf: [
          { properties: { status: { not: { enum: ["building"] } } } },
          {
            required: ["success_criteria"],
            properties: { success_criteria: { bsonType: "array", minItems: 1 } },
          },
        ],
      },
      // If kind is "synthesis", parents/synthesis_thesis required and depth ≥ 1.
      {
        oneOf: [
          { properties: { kind: { not: { enum: ["synthesis"] } } } },
          {
            required: ["parents", "synthesis_thesis"],
            properties: {
              parents: { bsonType: "array", minItems: 2 },
              synthesis_thesis: { bsonType: "string", minLength: 1 },
              synthesis_depth: { bsonType: ["int", "long"], minimum: 1, maximum: 2 },
            },
          },
        ],
      },
    ],
  },
};

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
  const collections = ["seen_items", "signals", "preferences", "ideas", "audit_log", "system_state", "factory_lock"];
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

  // Apply $jsonSchema validator in WARN mode initially. Promote to STRICT
  // after one daily cycle confirms zero violations against real data
  // (separate one-shot, not automated here).
  await db.command({
    collMod: "ideas",
    validator: IDEAS_VALIDATOR,
    validationLevel: "moderate",
    validationAction: "warn",
  });
  console.log("✓ ideas validator (warn mode)");

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
