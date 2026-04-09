/**
 * brief-state.ts — helper that does mongo state work for the morning brief.
 *
 * Modes:
 *   dedupe   — read fetch JSON, dedupe+upsert seen_items, print annotated items
 *   themes   — print aggregate of trending themes over last 7 days
 *   signals  — read signals JSON from stdin, insert into signals collection
 */
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI!;
const dbName = process.env.MONGODB_DB ?? "morning-brief";
const mode = process.argv[2];

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

if (mode === "dedupe") {
  const path = process.argv[3];
  const raw = JSON.parse(await Bun.file(path).text());
  const items = [...(raw.hn ?? []), ...(raw.reddit ?? []), ...(raw.github ?? [])];
  const ids = items.map((i: any) => i.id);
  const existing = await db
    .collection("seen_items")
    .find({ _id: { $in: ids } as any })
    .toArray();
  const existingMap = new Map(existing.map((e: any) => [e._id, e]));
  const now = new Date();
  const newOps: any[] = [];
  const updOps: any[] = [];
  const annotated = items.map((it: any) => {
    const prior = existingMap.get(it.id);
    if (prior) {
      updOps.push({
        updateOne: {
          filter: { _id: it.id },
          update: { $set: { last_seen: now, last_score: it.score }, $inc: { times_seen: 1 } },
        },
      });
      return { ...it, isNew: false, isReturning: true, times_seen: (prior.times_seen ?? 1) + 1 };
    }
    newOps.push({
      insertOne: {
        document: {
          _id: it.id,
          source: it.source,
          title: it.title,
          url: it.url,
          first_seen: now,
          last_seen: now,
          times_seen: 1,
          last_score: it.score,
        },
      },
    });
    return { ...it, isNew: true, isReturning: false, times_seen: 1 };
  });
  if (newOps.length || updOps.length) {
    await db.collection("seen_items").bulkWrite([...newOps, ...updOps]);
  }
  console.log(JSON.stringify(annotated));
} else if (mode === "themes") {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  const cutoff = d.toISOString().slice(0, 10);
  const res = await db
    .collection("signals")
    .aggregate([
      { $match: { date: { $gte: cutoff } } },
      { $group: { _id: "$theme", total: { $sum: "$mentions" }, days: { $addToSet: "$date" } } },
      { $sort: { total: -1 } },
      { $limit: 8 },
    ])
    .toArray();
  console.log(JSON.stringify(res));
} else if (mode === "signals") {
  const raw = await Bun.stdin.text();
  const docs = JSON.parse(raw);
  if (Array.isArray(docs) && docs.length) {
    await db.collection("signals").insertMany(docs);
  }
  console.log(JSON.stringify({ inserted: docs.length }));
} else {
  console.error("unknown mode:", mode);
  process.exit(1);
}
await client.close();
