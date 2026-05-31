import { test, expect, beforeAll, afterAll, afterEach } from "bun:test";
import { MongoClient, type Db } from "mongodb";
import { acquireLock, releaseLock, checkLock } from "../factory-lock";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB ?? "morning-brief";

// Live-Mongo tests. Skip cleanly if MONGODB_URI not set — same pattern as
// the rest of the I/O layer. Use a unique slug prefix so we don't collide
// with real factory runs.
const testIf = test.skipIf(!uri);

let client: MongoClient;
let db: Db;

beforeAll(async () => {
  if (!uri) return;
  client = new MongoClient(uri);
  await client.connect();
  db = client.db(dbName);
});

afterAll(async () => {
  if (!uri) return;
  await client.close();
});

afterEach(async () => {
  if (!uri) return;
  // Best-effort cleanup of the singleton lock after each test.
  await db.collection("factory_lock").deleteOne({ _id: "singleton" as any });
});

testIf("acquireLock: free → acquired with prior_owner=null and takeover=false", async () => {
  const result = await acquireLock(db, "__test_idea_1", 60_000, 4242, 4243);
  expect(result.acquired).toBe(true);
  expect(result.prior_owner).toBeNull();
  expect(result.takeover).toBe(false);
  // pgid round-trips through the stored document
  const state = await checkLock(db);
  expect(state?.pid).toBe(4242);
  expect(state?.pgid).toBe(4243);
});

testIf("acquireLock: held by fresh owner → not acquired, prior_owner present, takeover=false", async () => {
  await acquireLock(db, "__test_idea_A", 60_000, 11111);
  const result = await acquireLock(db, "__test_idea_B", 60_000, 22222);
  expect(result.acquired).toBe(false);
  expect(result.prior_owner).not.toBeNull();
  expect(result.prior_owner!.idea_slug).toBe("__test_idea_A");
  expect(result.prior_owner!.pid).toBe(11111);
  expect(result.takeover).toBe(false);
});

testIf("acquireLock: held by stale owner → acquired via takeover, prior_owner present, takeover=true", async () => {
  // Insert a stale lock directly (started_at well in the past).
  await db.collection("factory_lock").insertOne({
    _id: "singleton" as any,
    idea_slug: "__test_stale",
    started_at: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2h ago
    ttl_ms: 60_000, // 1min TTL — definitely stale
    pid: 99999,
  });
  const result = await acquireLock(db, "__test_taking_over", 60_000, 33333);
  expect(result.acquired).toBe(true);
  expect(result.prior_owner).not.toBeNull();
  expect(result.prior_owner!.idea_slug).toBe("__test_stale");
  expect(result.takeover).toBe(true);
});

testIf("releaseLock: matching slug deletes the lock", async () => {
  await acquireLock(db, "__test_release_match", 60_000, 44444);
  await releaseLock(db, "__test_release_match");
  const after = await db.collection("factory_lock").findOne({ _id: "singleton" as any });
  expect(after).toBeNull();
});

testIf("releaseLock: mismatched slug is a no-op (defensive against takeover races)", async () => {
  await acquireLock(db, "__test_release_real", 60_000, 55555);
  await releaseLock(db, "__test_release_other");
  const after = await db.collection("factory_lock").findOne({ _id: "singleton" as any });
  expect(after).not.toBeNull();
  expect((after as any).idea_slug).toBe("__test_release_real");
});

testIf("checkLock: returns null when no lock held", async () => {
  expect(await checkLock(db)).toBeNull();
});

testIf("checkLock: returns the current owner when lock is held", async () => {
  await acquireLock(db, "__test_checklock", 60_000, 66666);
  const state = await checkLock(db);
  expect(state).not.toBeNull();
  expect(state!.idea_slug).toBe("__test_checklock");
  expect(state!.pid).toBe(66666);
});
