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
      library_refs: { bsonType: ["array", "null"] },
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
      // Material implication "status=building => success_criteria has minItems 1".
      // Equivalent: status != building OR success_criteria has items. anyOf is
      // the right operator here (NOT oneOf — oneOf rejects docs where both
      // branches match, which happens whenever success_criteria is set on a
      // non-building idea, e.g. a triaged-but-not-yet-building queued idea).
      {
        anyOf: [
          { properties: { status: { not: { enum: ["building"] } } } },
          {
            required: ["success_criteria"],
            properties: { success_criteria: { bsonType: "array", minItems: 1 } },
          },
        ],
      },
      // Material implication "kind=synthesis => parents/synthesis_thesis required, depth >= 1".
      // Same anyOf-not-oneOf reasoning as above.
      {
        anyOf: [
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

const LIBRARY_VALIDATOR = {
  $jsonSchema: {
    bsonType: "object",
    required: [
      "slug",
      "title",
      "summary",
      "tags",
      "sources",
      "path",
      "embedding",
      "first_read",
      "last_updated",
      "runs",
      "schema_version",
    ],
    properties: {
      slug: { bsonType: "string", minLength: 1 },
      title: { bsonType: "string", minLength: 1 },
      summary: { bsonType: "string", minLength: 1 },
      tags: { bsonType: "array" },
      sources: { bsonType: "array" },
      path: { bsonType: "string", minLength: 1 },
      embedding: { bsonType: "array", minItems: 384, maxItems: 384 },
      first_read: { bsonType: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      last_updated: { bsonType: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      runs: { bsonType: "array" },
      schema_version: { bsonType: ["int", "long", "double"] },
      indexed_at: { bsonType: "date" },
    },
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
  const collections = ["seen_items", "signals", "preferences", "ideas", "audit_log", "system_state", "factory_lock", "factory_runs", "library"];
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
  await db.collection("ideas").createIndex({ status: 1, signal_strength: -1 });
  await db.collection("ideas").createIndex({ created_at: -1 });
  console.log("✓ ideas indexes");

  // Apply $jsonSchema validator: action=error (reject bad writes),
  // level=moderate (re-validate updates only on docs already matching
  // the schema — protects any pre-validator rows from breaking on
  // innocuous updates). Run `bun run verify-validator` before
  // re-applying after any schema edit.
  await db.command({
    collMod: "ideas",
    validator: IDEAS_VALIDATOR,
    validationLevel: "moderate",
    validationAction: "error",
  });
  console.log("✓ ideas validator (error action, moderate level)");

  await db.collection("library").createIndex({ slug: 1 }, { unique: true });
  console.log("✓ library indexes");

  await db.command({
    collMod: "library",
    validator: LIBRARY_VALIDATOR,
    validationLevel: "moderate",
    validationAction: "error",
  });
  console.log("✓ library validator (error action, moderate level)");

  await db.collection("factory_runs").createIndex({ idea_slug: 1 });
  await db.collection("factory_runs").createIndex({ started_at: -1 });
  console.log("✓ factory_runs indexes");

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
