// src/stealth-source.ts

import { type RawItem, type FetchResult, redditId, sourceStatus } from "./sources.ts";

export async function parseHtmlList(
  html: string,
  opts: { linkPrefix: string; origin: string },
): Promise<Array<{ title: string; url: string }>> {
  const out: Array<{ title: string; url: string }> = [];
  const seen = new Set<string>();
  let current: { href: string; text: string } | null = null;

  const rewriter = new HTMLRewriter().on(`a[href^="${opts.linkPrefix}"]`, {
    element(el) {
      const href = el.getAttribute("href") ?? "";
      current = { href, text: "" };
      el.onEndTag(() => {
        if (!current) return;
        const title = current.text.trim().replace(/\s+/g, " ");
        const url = new URL(current.href, opts.origin).href;
        if (title && !seen.has(url)) {
          seen.add(url);
          out.push({ title, url });
        }
        current = null;
      });
    },
    text(t) {
      if (current) {
        // Add space between non-whitespace text nodes
        if (current.text && /\S$/.test(current.text) && /^\S/.test(t.text)) {
          current.text += " ";
        }
        current.text += t.text;
      }
    },
  });

  await rewriter.transform(new Response(html)).text();
  return out;
}

const num = (v: string | null): number | undefined =>
  v == null || v === "" ? undefined : Number(v);

export async function parseRedditHtml(html: string): Promise<RawItem[]> {
  const out: RawItem[] = [];
  const seen = new Set<string>();
  let cur:
    | { fullname: string; permalink: string; sub: string; score?: number;
        comments?: number; ts?: number; skip: boolean; title: string }
    | null = null;

  const rewriter = new HTMLRewriter()
    .on('div.thing[data-fullname^="t3_"]', {
      element(el) {
        const cls = el.getAttribute("class") ?? "";
        cur = {
          fullname: el.getAttribute("data-fullname") ?? "",
          permalink: el.getAttribute("data-permalink") ?? "",
          sub: el.getAttribute("data-subreddit") ?? "",
          score: num(el.getAttribute("data-score")),
          comments: num(el.getAttribute("data-comments-count")),
          ts: num(el.getAttribute("data-timestamp")),
          skip: el.getAttribute("data-promoted") === "true" || /\bstickied\b/.test(cls),
          title: "",
        };
        el.onEndTag(() => {
          const c = cur;
          cur = null;
          if (!c || c.skip) return;
          const id = redditId(c.fullname.replace(/^t3_/, ""));
          const title = c.title.trim().replace(/\s+/g, " ");
          if (!title || seen.has(id)) return;
          seen.add(id);
          out.push({
            id,
            source: "reddit",
            sourceLabel: `reddit/r/${c.sub}`,
            title,
            url: `https://reddit.com${c.permalink}`,
            score: c.score,
            comments: c.comments,
            timestamp: c.ts != null ? Math.floor(c.ts / 1000) : undefined,
          });
        });
      },
    })
    .on('a[data-event-action="title"]', {
      text(t) {
        if (cur) cur.title += t.text;
      },
    });

  await rewriter.transform(new Response(html)).text();
  return out;
}

export interface StealthSpec {
  url: string;
  label: string;
  parse: "reddit-html" | "html-list";
  linkPrefix?: string;
}

export type StealthRunner = (
  urls: string[],
) => Promise<Array<{ url: string; status: number; body: string; error?: string | null }>>;

// Stable id for html-list items (no natural id like reddit's fullname).
const stealthId = (url: string) =>
  "stealth:" + new Bun.CryptoHasher("sha1").update(url).digest("hex").slice(0, 16);

// Camoufox browser automation is hang-prone and this runs unattended at
// 06:30 — a stuck s.fetch() must not block the brief indefinitely. Generous
// so it only trips on a genuine hang, not on 8 slowish subreddit pages.
const STEALTH_SPAWN_TIMEOUT_MS = 180_000;

async function spawnStealthCli(urls: string[]) {
  const proc = Bun.spawn(["python3", "scripts/stealth-fetch.py"], {
    stdin: new TextEncoder().encode(urls.join("\n")),
    stdout: "pipe",
    stderr: "pipe",
    cwd: import.meta.dir + "/..", // repo root, so the script path resolves regardless of caller cwd
    timeout: STEALTH_SPAWN_TIMEOUT_MS,
  });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  // A timeout kill can leave exitCode null rather than nonzero, so check
  // exitCode/signalCode directly instead of trusting the exited-code alone.
  if (proc.exitCode !== 0 || proc.signalCode) {
    const err = await new Response(proc.stderr).text();
    const reason = proc.signalCode
      ? `timed out after ${STEALTH_SPAWN_TIMEOUT_MS}ms (killed with ${proc.signalCode})`
      : `exited ${proc.exitCode}`;
    throw new Error(`stealth-fetch.py ${reason}: ${err.trim()}`);
  }
  return JSON.parse(out) as Awaited<ReturnType<StealthRunner>>;
}

export async function fetchStealth(
  specs: StealthSpec[],
  deps: { run?: StealthRunner; fetchFn?: typeof fetch } = {},
): Promise<FetchResult> {
  const bodies = new Map<string, { status: number; body: string; error?: string | null }>();
  let batchError: string | undefined;

  const browserSpecs = specs.filter((s) => s.parse === "reddit-html");
  const plainSpecs = specs.filter((s) => s.parse === "html-list");

  if (browserSpecs.length) {
    const run = deps.run ?? spawnStealthCli;
    try {
      for (const r of await run(browserSpecs.map((s) => s.url))) bodies.set(r.url, r);
    } catch (e) {
      batchError = (e as Error).message;
    }
  }

  const doFetch = deps.fetchFn ?? fetch;
  await Promise.all(
    plainSpecs.map(async (s) => {
      try {
        const res = await doFetch(s.url);
        bodies.set(s.url, {
          status: res.status,
          body: res.ok ? await res.text() : "",
          error: res.ok ? null : `HTTP ${res.status}`,
        });
      } catch (e) {
        bodies.set(s.url, { status: 0, body: "", error: String(e) });
      }
    }),
  );

  const items: RawItem[] = [];
  const seen = new Set<string>();
  let errors = 0;

  for (const spec of specs) {
    const r = bodies.get(spec.url);
    if (!r || r.error || r.status >= 400 || !r.body) {
      errors++;
      continue;
    }
    try {
      const parsed =
        spec.parse === "reddit-html"
          ? await parseRedditHtml(r.body)
          : (
              await parseHtmlList(r.body, {
                linkPrefix: spec.linkPrefix ?? "/",
                origin: new URL(spec.url).origin,
              })
            ).map(
              (l): RawItem => ({
                id: stealthId(l.url),
                source: "stealth",
                sourceLabel: spec.label,
                title: l.title,
                url: l.url,
              }),
            );
      for (const it of parsed) {
        if (seen.has(it.id)) continue;
        seen.add(it.id);
        items.push(it);
      }
    } catch {
      errors++;
    }
  }

  return {
    items,
    status: sourceStatus({ items: items.length, errors, attempts: specs.length }),
    note: batchError ?? (errors ? `${errors}/${specs.length} stealth sources failed` : undefined),
  };
}
