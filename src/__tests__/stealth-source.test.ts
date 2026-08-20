import { describe, expect, test } from "bun:test";
import { parseHtmlList, parseRedditHtml, fetchStealth, type StealthSpec, type StealthRunner } from "../stealth-source.ts";

describe("parseHtmlList", () => {
  const html = `
    <a href="/engineering/harnesses"><h3>Effective harnesses</h3><span>Nov 26 2025</span></a>
    <a href="/engineering/postmortem"><h3>A postmortem</h3></a>
    <a href="/about">About</a>
    <a href="/engineering/harnesses"><h3>Effective harnesses</h3></a>`;

  test("extracts prefix-matching anchors as {title,url}, absolute + deduped", async () => {
    const out = await parseHtmlList(html, {
      linkPrefix: "/engineering/",
      origin: "https://www.anthropic.com",
    });
    expect(out).toEqual([
      { title: "Effective harnesses Nov 26 2025", url: "https://www.anthropic.com/engineering/harnesses" },
      { title: "A postmortem", url: "https://www.anthropic.com/engineering/postmortem" },
    ]);
  });

  test("ignores non-matching anchors and empty-text anchors", async () => {
    const out = await parseHtmlList(`<a href="/engineering/x"></a><a href="/news/y">Y</a>`, {
      linkPrefix: "/engineering/",
      origin: "https://www.anthropic.com",
    });
    expect(out).toEqual([]);
  });
});

describe("parseRedditHtml", () => {
  const html = `
    <div class=" thing id-t3_aaa odd link self" data-fullname="t3_aaa"
         data-subreddit="LocalLLaMA" data-permalink="/r/LocalLLaMA/comments/aaa/first_post/"
         data-timestamp="1786754473000" data-comments-count="12" data-score="42" data-promoted="false">
      <a class="title may-blank" data-event-action="title"
         href="/r/LocalLLaMA/comments/aaa/first_post/">First post</a>
    </div>
    <div class=" thing id-t3_bbb even link stickied self" data-fullname="t3_bbb"
         data-subreddit="LocalLLaMA" data-permalink="/r/LocalLLaMA/comments/bbb/mega/"
         data-timestamp="1786000000000" data-comments-count="99" data-score="500" data-promoted="false">
      <a class="title may-blank" data-event-action="title"
         href="/r/LocalLLaMA/comments/bbb/mega/">Sticky megathread</a>
    </div>
    <div class=" thing id-t3_ccc odd promotedlink" data-fullname="t3_ccc"
         data-subreddit="ads" data-permalink="/r/ads/comments/ccc/ad/"
         data-score="0" data-promoted="true">
      <a class="title may-blank" data-event-action="title"
         href="/r/ads/comments/ccc/ad/">An ad</a>
    </div>`;

  test("maps non-stickied non-promoted posts to full RawItems", async () => {
    const out = await parseRedditHtml(html);
    expect(out).toEqual([
      {
        id: "reddit:aaa",
        source: "reddit",
        sourceLabel: "reddit/r/LocalLLaMA",
        title: "First post",
        url: "https://reddit.com/r/LocalLLaMA/comments/aaa/first_post/",
        score: 42,
        comments: 12,
        timestamp: 1786754473,
      },
    ]);
  });

  test("skips stickied and promoted posts", async () => {
    const out = await parseRedditHtml(html);
    expect(out.map((i) => i.id)).toEqual(["reddit:aaa"]);
  });
});

describe("fetchStealth", () => {
  const redditSpecs: StealthSpec[] = [
    { url: "https://old.reddit.com/r/LocalLLaMA/", label: "reddit/r/LocalLLaMA", parse: "reddit-html" },
  ];
  const blogSpecs: StealthSpec[] = [
    { url: "https://www.anthropic.com/engineering", label: "anthropic/engineering", parse: "html-list", linkPrefix: "/engineering/" },
  ];
  const redditBody = `<div class=" thing link" data-fullname="t3_z" data-subreddit="LocalLLaMA"
      data-permalink="/r/LocalLLaMA/comments/z/x/" data-score="5" data-comments-count="1"
      data-timestamp="1000" data-promoted="false">
      <a data-event-action="title" href="/r/LocalLLaMA/comments/z/x/">Reddit post</a></div>`;

  test("reddit-html specs fetch via run() and parse posts", async () => {
    const run: StealthRunner = async (urls) => urls.map((url) => ({ url, status: 200, body: redditBody, error: null }));
    const res = await fetchStealth(redditSpecs, { run });
    expect(res.status).toBe("ok");
    expect(res.items.map((i) => i.id)).toEqual(["reddit:z"]);
    expect(res.items[0].source).toBe("reddit");
  });

  test("html-list specs fetch via fetchFn and get stealth ids", async () => {
    const fetchFn = (async () =>
      new Response(`<a href="/engineering/harnesses"><h3>Harnesses</h3></a>`, { status: 200 })) as unknown as typeof fetch;
    const res = await fetchStealth(blogSpecs, { fetchFn });
    expect(res.status).toBe("ok");
    expect(res.items[0].id).toMatch(/^stealth:/);
    expect(res.items[0].source).toBe("stealth");
    expect(res.items[0].sourceLabel).toBe("anthropic/engineering");
  });

  test("all-failed sources report failed, not empty", async () => {
    const run: StealthRunner = async (urls) => urls.map((url) => ({ url, status: 403, body: "", error: "blocked" }));
    const res = await fetchStealth(redditSpecs, { run });
    expect(res.status).toBe("failed");
    expect(res.items).toHaveLength(0);
  });

  test("a thrown browser batch is failed with the error in note", async () => {
    const run: StealthRunner = async () => { throw new Error("python3 not found"); };
    const res = await fetchStealth(redditSpecs, { run });
    expect(res.status).toBe("failed");
    expect(res.note).toContain("python3 not found");
  });

  test("partial failure keeps good items and notes the bad one", async () => {
    const specs = [...blogSpecs, { url: "https://www.anthropic.com/news", label: "anthropic/news", parse: "html-list", linkPrefix: "/news/" } as StealthSpec];
    const fetchFn = (async (url: string) =>
      url.includes("/news")
        ? new Response("blocked", { status: 403 })
        : new Response(`<a href="/engineering/x"><h3>X</h3></a>`, { status: 200 })) as unknown as typeof fetch;
    const res = await fetchStealth(specs, { fetchFn });
    expect(res.items).toHaveLength(1);
    expect(res.note).toContain("1/2");
  });
});
