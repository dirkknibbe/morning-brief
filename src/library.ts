/**
 * library.ts — research-library CLI: index library/*.md into Mongo, retrieve
 * by similarity. Pure logic lives in library-entry.ts; this file is the I/O
 * layer (mirrors the dedupe-ideas.ts / ideas-state.ts split).
 *
 * Modes:
 *   upsert <path>                — parse + embed one entry, upsert by slug
 *   relevant --text <t> [--k 3]  — top-K entries by cosine similarity (JSON)
 *   list                         — all entries {slug,title,last_updated} (JSON)
 *   reindex                      — upsert every library/*.md (recovery/backfill)
 *
 * Contract: git (library/*.md) is the source of truth; the Mongo `library`
 * collection is a REBUILDABLE index. Trigger callers treat upsert failures
 * as warnings, never aborts.
 */

import { MongoClient, type Db } from "mongodb";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { embed } from "./embeddings";
import { parseFlagArgs } from "./cli-args";
import {
  parseLibraryEntry,
  embedText,
  rankBySimilarity,
  type IndexedEntry,
} from "./library-entry";

const SCHEMA_VERSION = 1;

export async function upsertEntry(db: Db, path: string): Promise<string> {
  const md = readFileSync(path, "utf8");
  const entry = parseLibraryEntry(md, path);
  const expected = `${entry.slug}.md`;
  if (basename(path) !== expected) {
    throw new Error(`${path}: filename must be "${expected}" to match the slug`);
  }
  const vec = await embed(embedText(entry));
  await db.collection("library").updateOne(
    { slug: entry.slug },
    {
      $set: {
        title: entry.title,
        summary: entry.summary,
        tags: entry.tags,
        sources: entry.sources,
        path,
        embedding: Array.from(vec),
        first_read: entry.first_read,
        last_updated: entry.last_updated,
        runs: entry.runs,
        schema_version: SCHEMA_VERSION,
        indexed_at: new Date(),
      },
    },
    { upsert: true },
  );
  return entry.slug;
}

// CLI
if (import.meta.main) {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("library: MONGODB_URI is not set");
    process.exit(1);
  }
  const dbName = process.env.MONGODB_DB ?? "morning-brief";
  const mode = process.argv[2];
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(dbName);

    if (mode === "upsert") {
      const path = process.argv[3];
      if (!path) { console.error("usage: library upsert <path>"); process.exit(1); }
      const slug = await upsertEntry(db, path);
      console.log(`✓ indexed ${slug} (${path})`);
    } else if (mode === "relevant") {
      const args = parseFlagArgs(process.argv.slice(3));
      const text = args.text;
      if (!text || text === "true") { console.error("relevant: --text is required"); process.exit(1); }
      const k = Number(args.k ?? "3");
      if (!Number.isFinite(k) || k < 1) { console.error("relevant: --k must be a positive number"); process.exit(1); }
      const docs = (await db
        .collection("library")
        .find({}, { projection: { _id: 0, slug: 1, title: 1, path: 1, summary: 1, embedding: 1 } })
        .toArray()) as unknown as IndexedEntry[];
      const query = await embed(text);
      console.log(JSON.stringify(rankBySimilarity(query, docs, k), null, 2));
    } else if (mode === "list") {
      const docs = await db
        .collection("library")
        .find({}, { projection: { _id: 0, slug: 1, title: 1, last_updated: 1 } })
        .sort({ last_updated: -1 })
        .toArray();
      console.log(JSON.stringify(docs, null, 2));
    } else if (mode === "reindex") {
      if (!existsSync("library")) {
        console.log("(no library/ directory — nothing to index)");
      } else {
        const files = readdirSync("library").filter((f) => f.endsWith(".md")).sort();
        let failed = 0;
        for (const f of files) {
          try {
            const slug = await upsertEntry(db, join("library", f));
            console.log(`✓ ${slug}`);
          } catch (e) {
            failed++;
            console.error(`✗ ${f}: ${(e as Error).message}`);
          }
        }
        const ok = files.length - failed;
        console.log(`reindexed ${ok} entr${ok === 1 ? "y" : "ies"}${failed > 0 ? `, ${failed} failed` : ""}`);
        if (failed > 0) process.exitCode = 1;
      }
    } else {
      console.error("usage: library <upsert|relevant|list|reindex> [args]");
      process.exit(1);
    }
  } finally {
    await client.close();
  }
}
