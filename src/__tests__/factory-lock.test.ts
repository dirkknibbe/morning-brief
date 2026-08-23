import { test, expect, beforeAll, afterAll, afterEach } from "bun:test";
import { MongoClient, type Db } from "mongodb";
import { acquireLock, releaseLock, checkLock, isLockReapable, type IsAlive } from "../factory-lock";

// Injected liveness stubs so lock tests don't depend on real process groups
// (the fake pids below are not live).
const ALIVE: IsAlive = () => true;
const DEAD: IsAlive = () => false;

// ── pure reap decision (no Mongo, always runs) ────────────────────────

test("isLockReapable: dead process group → reapable even when fresh", () => {
  const fresh = { started_at: new Date(1_000), ttl_ms: 3_600_000, pgid: 4242 };
  expect(isLockReapable(fresh, 1_000, DEAD, 3_600_000)).toBe(true);
});

test("isLockReapable: live group + within TTL → NOT reapable", () => {
  const fresh = { started_at: new Date(1_000), ttl_ms: 3_600_000, pgid: 4242 };
  expect(isLockReapable(fresh, 1_000 + 60_000, ALIVE, 3_600_000)).toBe(false);
});

test("isLockReapable: live group but past TTL → reapable (passive expiry)", () => {
  const old = { started_at: new Date(0), ttl_ms: 60_000, pgid: 4242 };
  expect(isLockReapable(old, 120_000, ALIVE, 3_600_000)).toBe(true);
});

test("isLockReapable: no pgid → falls back to TTL only (never liveness-reaped)", () => {
  const noPgid = { started_at: new Date(0), ttl_ms: 60_000 };
  expect(isLockReapable(noPgid, 30_000, DEAD, 3_600_000)).toBe(false); // within TTL
  expect(isLockReapable(noPgid, 120_000, DEAD, 3_600_000)).toBe(true); // past TTL
});

// ── live-Mongo tests (skip cleanly if MONGODB_URI not set) ────────────

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB ?? "morning-brief";
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
  await db.collection("factory_lock").deleteOne({ _id: "singleton" as any });
});

testIf("acquireLock: free → acquired with prior_owner=null and takeover=false", async () => {
  const result = await acquireLock(db, "__test_idea_1", 60_000, 4242, 4243, ALIVE);
  expect(result.acquired).toBe(true);
  expect(result.prior_owner).toBeNull();
  expect(result.takeover).toBe(false);
  const state = await checkLock(db, ALIVE);
  expect(state?.pid).toBe(4242);
  expect(state?.pgid).toBe(4243);
});

testIf("acquireLock: held by live fresh owner → not acquired, prior_owner present", async () => {
  await acquireLock(db, "__test_idea_A", 60_000, 11111, 11111, ALIVE);
  const result = await acquireLock(db, "__test_idea_B", 60_000, 22222, 22222, ALIVE);
  expect(result.acquired).toBe(false);
  expect(result.prior_owner?.idea_slug).toBe("__test_idea_A");
  expect(result.takeover).toBe(false);
});

testIf("acquireLock: held by stale (past-TTL) owner → acquired via takeover", async () => {
  await db.collection("factory_lock").insertOne({
    _id: "singleton" as any,
    idea_slug: "__test_stale",
    started_at: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2h ago
    ttl_ms: 60_000, // 1min TTL — definitely stale
    pid: 99999,
  });
  const result = await acquireLock(db, "__test_taking_over", 60_000, 33333, 33333, ALIVE);
  expect(result.acquired).toBe(true);
  expect(result.prior_owner?.idea_slug).toBe("__test_stale");
  expect(result.takeover).toBe(true);
});

testIf("acquireLock: held by DEAD-group owner → acquired via takeover even within TTL", async () => {
  await acquireLock(db, "__test_dead", 3_600_000, 88888, 88888, ALIVE); // fresh, 1h TTL
  // A new build sees the owner's group as dead → reaps and takes over.
  const result = await acquireLock(db, "__test_reaper", 3_600_000, 77777, 77777, DEAD);
  expect(result.acquired).toBe(true);
  expect(result.prior_owner?.idea_slug).toBe("__test_dead");
  expect(result.takeover).toBe(true);
});

testIf("checkLock: null when no lock; owner when live; null when the group is dead", async () => {
  expect(await checkLock(db, ALIVE)).toBeNull();
  await acquireLock(db, "__test_checklock", 3_600_000, 66666, 66666, ALIVE);
  expect((await checkLock(db, ALIVE))?.idea_slug).toBe("__test_checklock");
  // Same fresh lock, but its process group is gone → reported as no build.
  expect(await checkLock(db, DEAD)).toBeNull();
});

testIf("releaseLock: matching slug deletes; mismatched slug is a no-op", async () => {
  await acquireLock(db, "__test_release_real", 60_000, 55555, 55555, ALIVE);
  await releaseLock(db, "__test_release_other");
  expect(await db.collection("factory_lock").findOne({ _id: "singleton" as any })).not.toBeNull();
  await releaseLock(db, "__test_release_real");
  expect(await db.collection("factory_lock").findOne({ _id: "singleton" as any })).toBeNull();
});
