import { describe, expect, test } from "bun:test";
import { parseHtmlList, parseRedditHtml } from "../stealth-source.ts";

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
