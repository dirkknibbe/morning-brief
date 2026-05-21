/**
 * verify-ideas-validator.ts — find any ideas docs that violate the current
 * $jsonSchema validator. Used before promoting the validator from warn to
 * error mode.
 *
 * Exits 0 with `OK — 0 violations` if clean.
 * Exits 1 and prints offending _ids + per-doc validation errors otherwise.
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

  // Fetch the validator currently applied to the ideas collection.
  const collInfo = await db
    .listCollections({ name: "ideas" }, { nameOnly: false })
    .toArray();
  const validator = collInfo[0]?.options?.validator;
  if (!validator) {
    console.error("No validator on ideas collection — run init-db first.");
    process.exit(1);
  }

  // Find any docs that do NOT match the validator.
  const violators = await db
    .collection("ideas")
    .find({ $nor: [validator] })
    .project({ _id: 1, slug: 1, status: 1, kind: 1 })
    .toArray();

  if (violators.length === 0) {
    console.log("OK — 0 violations across", await db.collection("ideas").countDocuments(), "ideas");
    process.exit(0);
  }

  console.error(`FAIL — ${violators.length} document(s) violate the validator:`);
  for (const v of violators) {
    console.error("  -", v.slug ?? v._id, `(status=${v.status}, kind=${v.kind})`);
  }
  process.exit(1);
} finally {
  await client.close();
}
