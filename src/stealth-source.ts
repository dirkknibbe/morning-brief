// src/stealth-source.ts

import { type RawItem, redditId } from "./sources.ts";

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
