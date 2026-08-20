// src/stealth-source.ts

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
